import { ok } from "@/lib/dintel/http";
import { coreModelInfo } from "@/lib/dintel/core";
import { FUSION_VERSION } from "@/lib/dintel/fusion";
import fs from "fs"; import path from "path";
import { ensureRegistry } from "@/lib/dintel/registry";
export const dynamic = "force-dynamic";
export async function GET() {
  try { await ensureRegistry(); } catch (e) { console.error("[dintel] registry", (e as Error).message); }
  const metrics = JSON.parse(fs.readFileSync(path.join(process.cwd(), "reports", "metrics.json"), "utf-8"));
  const summary = Object.fromEntries(Object.entries(metrics.tasks as Record<string, Record<string, unknown>>).map(([t, m]) => [t, { accuracy: m.accuracy, macro_f1: m.macro_f1, weighted_f1: m.weighted_f1, ece: (m.calibration as Record<string, number>).ece_calibrated, brier: (m.calibration as Record<string, number>).brier_calibrated, severe_recall: m.severe_recall ?? null, roc_auc: m.roc_auc ?? null, n_test: m.n_test, selected_model: m.selected_model }]));
  return ok({ core: coreModelInfo(), fusion: { version: FUSION_VERSION, kind: "rule_based_untrained", learned: false, note: "becomes trainable once verified_janrakshak_dataset exists" }, test_metrics: summary, evaluated_split: metrics.split, experiments: metrics.experiments });
}
