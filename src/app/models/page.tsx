import fs from "fs"; import path from "path";
import { coreModelInfo } from "@/lib/dintel/core";
import { ensureRegistry } from "@/lib/dintel/registry";
import { PageHeader, Section, f3, pct } from "@/components/ui";
export const dynamic = "force-dynamic";
/* eslint-disable @typescript-eslint/no-explicit-any */
export default async function ModelsPage() {
  try { await ensureRegistry(); } catch { /* db optional for rendering */ }
  const info = coreModelInfo();
  const metrics = JSON.parse(fs.readFileSync(path.join(process.cwd(), "reports", "metrics.json"), "utf-8"));
  const tr = JSON.parse(fs.readFileSync(path.join(process.cwd(), "reports", "training_report.json"), "utf-8"));
  const meta = JSON.parse(fs.readFileSync(path.join(process.cwd(), "models", "metadata", "dintel_core_v1.json"), "utf-8"));
  const models = [
    { name: "D-Intel Core", version: info.model_version, layer: "A", arch: info.architecture, dataset: info.dataset_version, date: info.training_timestamp, state: "DEPLOYED", cal: "temperature scaling (dev split)", tone: "pill-ok",
      metrics: Object.entries(metrics.tasks as Record<string, any>).map(([t, m]) => `${t}: F1 ${f3(m.macro_f1)} · ECE ${f3(m.calibration.ece_calibrated)}`) },
    { name: "D-Intel Operational Fusion", version: "dintel-fusion-v1.0.0", layer: "B", arch: "rule-based evidence fusion with provenance + independence groups (interface ready for learned model)", dataset: "none — no JanRakshak-labelled data exists yet", date: "—", state: "RULE-BASED", cal: "priority confidence is heuristic, uncalibrated", tone: "pill-warn", metrics: ["no learned metrics claimed"] },
    { name: "Transformer text classifier (DistilBERT)", version: "planned", layer: "A", arch: "distilbert-base-uncased + 4 task heads (ml/scripts/train_transformer.py)", dataset: "CrisisMMD v2 text", date: "—", state: "NOT TRAINED (no GPU in build sandbox)", cal: "—", tone: "pill-dim", metrics: ["no metrics — script provided but not executed"] },
    { name: "Image encoder (EfficientNet-B0)", version: "planned", layer: "A", arch: "transfer learning on CrisisMMD image damage labels", dataset: "CrisisMMD v2 images (not downloaded, 2.1GB)", date: "—", state: "NOT TRAINED", cal: "—", tone: "pill-dim", metrics: ["no metrics"] },
  ];
  return (
    <div>
      <PageHeader code="02 / MODEL LAB" title="Model registry" sub="Every artefact with its version, data, calibration and deployment state. Planned components are labelled as such — no metrics are shown for anything that was not trained." />
      <div className="p-8 space-y-4">
        {models.map((m) => (
          <div key={m.name} className="panel p-5 grid lg:grid-cols-4 gap-4">
            <div><p className="label">Layer {m.layer}</p><p className="text-base mt-1">{m.name}</p><p className="mono text-[11px] text-[var(--muted)]">{m.version}</p><span className={`pill mt-2 inline-block ${m.tone}`}>{m.state}</span></div>
            <div className="lg:col-span-2 text-[12px] space-y-1"><p><span className="k">architecture</span> {m.arch}</p><p><span className="k">dataset</span> {m.dataset}</p><p><span className="k">trained</span> <span className="mono">{m.date}</span></p><p><span className="k">calibration</span> {m.cal}</p></div>
            <div className="mono text-[11px] text-white/70 space-y-1">{m.metrics.map((x) => <p key={x}>{x}</p>)}</div>
          </div>))}
        <div className="grid lg:grid-cols-2 gap-4">
          <Section title="Core artefact metadata (models/metadata/dintel_core_v1.json)">
            <div className="mono text-[11px] space-y-1">{["model_version", "dataset_version", "training_timestamp", "git_commit", "label_mapping_version", "feature_registry_version", "calibration_version", "text_normalizer", "sha256", "size_bytes"].map((k) => <p key={k}><span className="k">{k}</span> <span className="break-all">{String(meta[k])}</span></p>)}
              <p><span className="k">hyperparameters</span> {JSON.stringify(meta.hyperparameters)}</p></div>
          </Section>
          <Section title="Per-task heads">
            <table className="w-full text-[12px] mono"><thead><tr className="label text-left"><th className="font-normal pb-2">task</th><th className="font-normal">head</th><th className="font-normal">classes</th><th className="font-normal">T</th><th className="font-normal">dev ECE raw→cal</th></tr></thead>
              <tbody>{Object.entries(info.tasks).map(([t, v]: [string, any]) => (<tr key={t} className="border-t border-[var(--line)]"><td className="py-1.5">{t}</td><td className="text-[var(--muted)]">{v.model_type}</td><td>{v.classes.length}</td><td>{v.temperature.toFixed(2)}</td><td>{f3(tr.tasks[t].calibration.dev_ece_uncalibrated)} → {f3(tr.tasks[t].calibration.dev_ece_calibrated)}</td></tr>))}</tbody></table>
            <p className="text-[11px] text-[var(--muted)] mt-3">Files: models/checkpoints/dintel_core_v1.pkl · models/exported/dintel_core_v1.json ({pct(meta.size_bytes / 1e6 / 100, 1).replace("%", " MB")}) · reports at /api/reports/*.html</p>
          </Section>
        </div>
      </div>
    </div>
  );
}
