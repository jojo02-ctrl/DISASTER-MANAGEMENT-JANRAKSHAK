import { ok } from "@/lib/dintel/http";
import { CORE_SUPPORTED_TYPES, DISASTER_TAXONOMY } from "@/lib/dintel/adapter";
import fs from "fs"; import path from "path"; import { load as yamlLoad } from "js-yaml";
export const dynamic = "force-dynamic";
export async function GET() {
  let registry: Record<string, unknown> = {};
  try { registry = yamlLoad(fs.readFileSync(path.join(process.cwd(), "configs", "feature_registry.yaml"), "utf-8")) as Record<string, unknown>; } catch (e) { registry = { error: `feature_registry.yaml unreadable: ${(e as Error).message}` }; }
  return ok({
    modalities: { text: "supported", image: "accepted, not analysed (no trained image encoder in v1); external detector evidence used", structured: "Layer B fusion only", sensor_evidence: "Layer B fusion only (aggregated fields, never raw IMU)", location: "coarse context only" },
    languages: { supported: ["en", "en-IN"], accepted_with_warning: ["hi", "multi"], note: "core model trained on English CrisisMMD tweets" },
    disaster_taxonomy: DISASTER_TAXONOMY, core_model_supported_types: CORE_SUPPORTED_TYPES,
    tasks: { learned: ["informative", "humanitarian_category", "damage_severity (text proxy of image label)", "disaster_type (4 classes)"], derived: ["response_priority", "requires_human_review", "overall_confidence"] },
    endpoints: ["GET /api/health", "GET /api/model", "GET /api/capabilities", "GET /api/metrics", "POST /api/predict", "POST /api/predict/text", "POST /api/predict/multimodal", "POST /api/predict/janrakshak", "PATCH /api/review"],
    feature_registry: registry,
  });
}
