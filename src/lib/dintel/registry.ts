import fs from "fs"; import path from "path";
import { db } from "@/db";
import { modelRegistry } from "@/db/schema";
import { coreModelInfo } from "./core";
import { FUSION_VERSION } from "./fusion";
/** Idempotently registers the deployed artefacts (called from /api/model and the Model Lab page). */
export async function ensureRegistry() {
  const info = coreModelInfo();
  const metrics = JSON.parse(fs.readFileSync(path.join(process.cwd(), "reports", "metrics.json"), "utf-8"));
  const summary = Object.fromEntries(Object.entries(metrics.tasks as Record<string, Record<string, unknown>>).map(([t, m]) => [t, { macro_f1: m.macro_f1, accuracy: m.accuracy, ece: (m.calibration as Record<string, number>).ece_calibrated }]));
  await db.insert(modelRegistry).values([
    { name: "D-Intel Core", version: info.model_version, layer: "A", architecture: info.architecture, datasetVersion: info.dataset_version, trainingTimestamp: info.training_timestamp, status: "deployed", calibrationStatus: "temperature_scaling_dev", metrics: summary, metadata: { sha256: info.sha256, hyperparameters: info.hyperparameters } },
    { name: "D-Intel Operational Fusion", version: FUSION_VERSION, layer: "B", architecture: "rule-based evidence fusion with provenance/independence groups", datasetVersion: "none (no JanRakshak-labelled data yet)", trainingTimestamp: null, status: "rule_based", calibrationStatus: "heuristic_uncalibrated", metrics: {}, metadata: { learned: false } },
  ]).onConflictDoNothing();
}
