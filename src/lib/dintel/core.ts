/**
 * D-Intel Layer A inference: loads models/exported/dintel_core_v1.json (trained by ml/scripts/train.py)
 * and reproduces the exact sklearn TF-IDF + linear-head + temperature-scaling pipeline in TypeScript.
 * Nothing here is hard-coded per example: every number comes from the exported weights.
 */
import fs from "fs";
import path from "path";

export type TaskName = "informative" | "humanitarian_category" | "damage_severity" | "disaster_type";

interface ExportedTask {
  classes: string[];
  model_type: string;
  temperature: number;
  calibration_status: string;
  weights: number[][];
  bias: number[];
}
export interface ExportedModel {
  model_version: string;
  dataset_version: string;
  training_timestamp: string;
  git_commit: string;
  architecture: string;
  hyperparameters: Record<string, unknown>;
  label_mapping_version: string;
  feature_registry_version: string;
  calibration_version: string;
  text_normalizer: string;
  vocab: string[];
  idf: number[];
  tasks: Record<TaskName, ExportedTask>;
}

export interface TaskPrediction {
  label: string;
  confidence: number;
  probabilities: Record<string, number>;
  calibration_status: string;
  margin: number; // top1 - top2 probability
}

/** MUST stay in sync with ml/dintel/core.py::normalize_text */
export function normalizeText(input: string): string {
  if (!input) return "";
  let s = input.replace(/[\u2019\u2018]/g, "'").replace(/[\u201c\u201d]/g, '"').toLowerCase();
  s = s.replace(/^rt\s+/, "");
  s = s.replace(/https?:\/\/\S+|www\.\S+/g, " url ");
  s = s.replace(/@[\p{L}\p{N}_]+/gu, " user ");
  s = s.replace(/#/g, " ").replace(/&amp;/g, " and ");
  s = s.replace(/[^\p{L}\p{N}_\s']/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** sklearn token_pattern (?u)\b\w\w+\b */
export function tokenize(norm: string): string[] {
  return norm.match(/[\p{L}\p{N}_]{2,}/gu) ?? [];
}

let cached: { model: ExportedModel; vocabIndex: Map<string, number>; sha: string } | null = null;

export function loadCoreModel() {
  if (cached) return cached;
  const p = path.join(process.cwd(), "models", "exported", "dintel_core_v1.json");
  const raw = fs.readFileSync(p, "utf-8");
  const model = JSON.parse(raw) as ExportedModel;
  const vocabIndex = new Map<string, number>();
  model.vocab.forEach((t, i) => vocabIndex.set(t, i));
  const meta = JSON.parse(fs.readFileSync(path.join(process.cwd(), "models", "metadata", "dintel_core_v1.json"), "utf-8"));
  cached = { model, vocabIndex, sha: meta.sha256 as string };
  return cached;
}

/** Sparse TF-IDF vector: sublinear tf, unigrams+bigrams, l2 normalised (matches TfidfVectorizer settings). */
export function vectorize(norm: string): Map<number, number> {
  const { model, vocabIndex } = loadCoreModel();
  const toks = tokenize(norm);
  const counts = new Map<number, number>();
  const bump = (t: string) => {
    const i = vocabIndex.get(t);
    if (i !== undefined) counts.set(i, (counts.get(i) ?? 0) + 1);
  };
  toks.forEach(bump);
  for (let i = 0; i < toks.length - 1; i++) bump(toks[i] + " " + toks[i + 1]);
  let sq = 0;
  const vec = new Map<number, number>();
  counts.forEach((c, i) => {
    const v = (1 + Math.log(c)) * model.idf[i];
    vec.set(i, v);
    sq += v * v;
  });
  const n = Math.sqrt(sq) || 1;
  vec.forEach((v, i) => vec.set(i, v / n));
  return vec;
}

function softmax(z: number[], T: number): number[] {
  const s = z.map((v) => v / T);
  const m = Math.max(...s);
  const e = s.map((v) => Math.exp(v - m));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

export function predictTask(task: TaskName, vec: Map<number, number>): TaskPrediction {
  const { model } = loadCoreModel();
  const t = model.tasks[task];
  const logits = t.bias.map((b, c) => {
    let acc = b;
    const row = t.weights[c];
    vec.forEach((v, i) => (acc += row[i] * v));
    return acc;
  });
  const probs = softmax(logits, t.temperature);
  const sorted = probs.map((p, i) => [p, i] as const).sort((a, b) => b[0] - a[0]);
  const safe = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
  return {
    label: t.classes[sorted[0][1]],
    confidence: safe(sorted[0][0]),
    probabilities: Object.fromEntries(t.classes.map((c, i) => [c, safe(probs[i])])),
    calibration_status: t.calibration_status,
    margin: safe(sorted[0][0] - (sorted[1]?.[0] ?? 0)),
  };
}

export interface CoreOutput {
  tasks: Record<TaskName, TaskPrediction>;
  token_count: number;
  in_vocab_tokens: number;
  vocab_coverage: number;
  normalized_text_length: number;
}

export function runCore(text: string): CoreOutput {
  const norm = normalizeText(text);
  const toks = tokenize(norm);
  const { vocabIndex } = loadCoreModel();
  const inVocab = toks.filter((t) => vocabIndex.has(t)).length;
  const vec = vectorize(norm);
  const tasks = {
    informative: predictTask("informative", vec),
    humanitarian_category: predictTask("humanitarian_category", vec),
    damage_severity: predictTask("damage_severity", vec),
    disaster_type: predictTask("disaster_type", vec),
  };
  return {
    tasks,
    token_count: toks.length,
    in_vocab_tokens: inVocab,
    vocab_coverage: toks.length ? inVocab / toks.length : 0,
    normalized_text_length: norm.length,
  };
}

/** Token-level attribution for a linear model = exact contribution w_c[i] * x[i] (no approximation needed). */
export function tokenAttribution(text: string, task: TaskName, label: string, topK = 8) {
  const { model, vocabIndex } = loadCoreModel();
  const t = model.tasks[task];
  const c = t.classes.indexOf(label);
  if (c < 0) return [];
  const vec = vectorize(normalizeText(text));
  const out: { token: string; contribution: number }[] = [];
  const inv = new Map<number, string>();
  vocabIndex.forEach((i, tok) => inv.set(i, tok));
  vec.forEach((v, i) => out.push({ token: inv.get(i) ?? "", contribution: t.weights[c][i] * v }));
  return out.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, topK)
    .map((o) => ({ ...o, contribution: Number(o.contribution.toFixed(4)) }));
}

export function coreModelInfo() {
  const { model, sha } = loadCoreModel();
  return {
    model_version: model.model_version,
    dataset_version: model.dataset_version,
    training_timestamp: model.training_timestamp,
    git_commit: model.git_commit,
    architecture: model.architecture,
    hyperparameters: model.hyperparameters,
    label_mapping_version: model.label_mapping_version,
    feature_registry_version: model.feature_registry_version,
    calibration_version: model.calibration_version,
    sha256: sha,
    tasks: Object.fromEntries(
      Object.entries(model.tasks).map(([k, v]) => [k, { classes: v.classes, model_type: v.model_type, temperature: v.temperature, calibration_status: v.calibration_status }])
    ),
  };
}
