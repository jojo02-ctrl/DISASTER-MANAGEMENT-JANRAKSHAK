import { randomUUID } from "crypto";
import { db } from "@/db";
import { predictions, apiMetrics } from "@/db/schema";
import { runCore, tokenAttribution, coreModelInfo, type CoreOutput } from "./core";
import { adaptJanRakshakPayload, extractedFeatureMap, type NormalizedIncident } from "./adapter";
import { fuse, FUSION_VERSION } from "./fusion";

export interface ImageInput { present: boolean; source: "upload" | "url" | "reference" | "none"; mime?: string | null; bytes?: number | null; url?: string | null; validation?: string[] }

export function buildResponse(opts: { endpoint: string; incident: NormalizedIncident; image?: ImageInput; startedAt: number }) {
  const { incident: n, endpoint } = opts;
  const core: CoreOutput | null = n.text.present ? runCore(n.text.value!) : null;
  const fusion = fuse(n, core);
  const img = opts.image ?? { present: false, source: "none" as const };
  const info = coreModelInfo();
  const requestId = randomUUID();
  const attribution = core ? {
    method: "exact linear contribution (w·x) per TF-IDF token — no approximation needed for a linear head",
    disaster_type: tokenAttribution(n.text.value!, "disaster_type", core.tasks.disaster_type.label),
    damage_severity: tokenAttribution(n.text.value!, "damage_severity", core.tasks.damage_severity.label),
    humanitarian_category: tokenAttribution(n.text.value!, "humanitarian_category", core.tasks.humanitarian_category.label),
  } : null;
  const response = {
    request_id: requestId,
    model_version: info.model_version,
    fusion_version: FUSION_VERSION,
    timestamp: new Date().toISOString(),
    endpoint,
    input_summary: {
      text_available: n.text.present, text_source: n.text.source,
      image_available: img.present, image_analysis: img.present ? "received but not analysed (no trained image encoder in v1)" : "none",
      structured_features_available: n.hazard.citizen_type !== null || n.operational.urgency_norm !== null || n.operational.score_norm !== null,
      sensor_evidence_available: n.sensor.present, location_available: n.location.present,
      existing_ai_evidence_available: n.ai.present,
      supported_language: n.language.normalized === "unknown" ? "en (assumed)" : n.language.normalized,
      language_warning: n.language.warning,
      text_warnings: n.text.warnings,
    },
    predictions: fusion.predictions,
    overall_confidence: fusion.overall_confidence,
    confidence_status: fusion.confidence_status,
    evidence_fusion: fusion.evidence_fusion,
    evidence_provenance: fusion.evidence_provenance,
    evidence_agreement: fusion.evidence_agreement,
    janrakshak_context: fusion.janrakshak_context,
    review: fusion.review,
    ood: fusion.ood,
    prediction_trace: fusion.prediction_trace,
    priority_breakdown: fusion.priority_breakdown,
    explanation: attribution,
    feature_map: extractedFeatureMap(n),
    adapter: {
      ignored_identity_fields: n.ignored_identity_fields, ignored_operational_fields: n.ignored_operational_fields, unknown_fields: n.unknown_fields,
      sensor_features: n.sensor.features, location_context: { accuracy_quality: n.location.accuracy_quality, in_india_bbox: n.location.in_india_bbox, city: n.location.city, state: n.location.state },
    },
    core_diagnostics: core ? { token_count: core.token_count, in_vocab_tokens: core.in_vocab_tokens, vocab_coverage: Math.round(core.vocab_coverage * 1000) / 1000 } : null,
    latency_ms: Date.now() - opts.startedAt,
  };
  return response;
}
export type DintelResponse = ReturnType<typeof buildResponse>;

export function incidentFromText(text: string, extra?: { type?: string; language?: string }): NormalizedIncident {
  return adaptJanRakshakPayload({ rawText: text, type: extra?.type, language: extra?.language });
}

export async function persist(resp: DintelResponse, rawText: string | null) {
  const p = resp.predictions as Record<string, { label: string | null; confidence: number | null }>;
  const logRaw = process.env.LOG_RAW_TEXT === "true";
  try {
    await db.insert(predictions).values({
      requestId: resp.request_id, endpoint: resp.endpoint, modelVersion: resp.model_version, fusionVersion: resp.fusion_version,
      textAvailable: resp.input_summary.text_available, imageAvailable: resp.input_summary.image_available,
      structuredAvailable: resp.input_summary.structured_features_available, sensorAvailable: resp.input_summary.sensor_evidence_available,
      locationAvailable: resp.input_summary.location_available,
      disasterType: p.disaster_type.label, disasterTypeConfidence: p.disaster_type.confidence,
      informative: p.informative.label, informativeConfidence: p.informative.confidence,
      humanitarianCategory: p.humanitarian_category.label, humanitarianConfidence: p.humanitarian_category.confidence,
      damageSeverity: p.damage_severity.label, damageSeverityConfidence: p.damage_severity.confidence,
      responsePriority: p.response_priority.label, priorityConfidence: p.response_priority.confidence,
      overallConfidence: resp.overall_confidence, requiresHumanReview: resp.review.requires_human_review, reviewReasons: resp.review.reasons,
      latencyMs: resp.latency_ms, response: sanitizeForStorage(resp), rawTextLogged: logRaw ? rawText : null,
    });
    await db.insert(apiMetrics).values({ endpoint: resp.endpoint, status: 200, latencyMs: resp.latency_ms, lowConfidence: (resp.overall_confidence ?? 1) < 0.5 });
  } catch (e) {
    console.error("[dintel] persist failed", (e as Error).message);
  }
}

/** Stored copy never contains token text (attribution) or location coordinates — request_id is the audit key. */
function sanitizeForStorage(resp: DintelResponse) {
  const copy = JSON.parse(JSON.stringify(resp));
  delete copy.explanation;
  return copy;
}
