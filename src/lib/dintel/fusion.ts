/**
 * Layer B — Operational Evidence Fusion (dintel-fusion-v1.0.0).
 * STATUS: rule-based & UNTRAINED. There is no JanRakshak-labelled dataset yet, so nothing here is "learned".
 * Every rule is explicit, every signal carries provenance + independence_group, and evidence from the same
 * group is never multiplied as if independent (section 40).
 */
import type { CoreOutput, TaskPrediction } from "./core";
import { compatGroup, CORE_SUPPORTED_TYPES, type NormalizedIncident } from "./adapter";

export const FUSION_VERSION = "dintel-fusion-v1.0.0";
export type Strength = "strong" | "moderate" | "weak" | "unavailable";
export type Agreement = "aligned" | "partially_aligned" | "contradictory" | "unavailable";

export interface EvidenceSignal {
  source: string;
  independence_group: "report" | "image" | "devices" | "device_gps";
  confidence: number | null;
  claim: string | null;
  note: string;
}

const strength = (c: number | null | undefined): Strength => (c == null ? "unavailable" : c >= 0.75 ? "strong" : c >= 0.5 ? "moderate" : "weak");
const r3 = (x: number) => Math.round(x * 1000) / 1000;

function agreement(a: string | null, b: string | null): Agreement {
  if (!a || !b) return "unavailable";
  if (a === b) return "aligned";
  const generic = new Set(["infra", "emergency", "other"]);
  if (generic.has(a) || generic.has(b)) return "partially_aligned";
  return "contradictory";
}

export interface FusionResult {
  predictions: Record<string, unknown>;
  evidence_fusion: Record<string, unknown>;
  evidence_provenance: EvidenceSignal[];
  evidence_agreement: { text_vs_image: Agreement; text_vs_citizen_type: Agreement; sensor_vs_event: "supportive" | "not_applicable" | "missing_for_signal_sensitive_event" | "weak" };
  prediction_trace: Record<string, string>;
  review: { requires_human_review: boolean; reasons: string[] };
  ood: { flags: string[]; vocab_coverage: number | null; token_count: number | null; method: string };
  overall_confidence: number | null;
  confidence_status: string;
  janrakshak_context: Record<string, boolean>;
  priority_breakdown: Record<string, number | string | null>;
}

const SEV_WEIGHT: Record<string, number> = { Severe: 1, Mild: 0.5, "Little or none": 0.1 };
const HUM_WEIGHT: Record<string, number> = {
  "Injured or dead people": 1, "Missing or found people": 1, "Affected individuals": 0.9, "Infrastructure and utility damage": 0.8,
  "Vehicle damage": 0.6, "Rescue, volunteering or donation effort": 0.6, "Other relevant information": 0.3, "Not humanitarian": 0,
};
const SIGNAL_SENSITIVE = new Set(["Earthquake", "Landslide", "Infrastructure"]);

export function fuse(n: NormalizedIncident, core: CoreOutput | null): FusionResult {
  const reasons: string[] = [];
  const ood: string[] = [];
  const prov: EvidenceSignal[] = [];
  const t = core?.tasks;

  // ---------- provenance (same-report signals share group "report")
  if (t) prov.push({ source: "text_model", independence_group: "report", confidence: t.disaster_type.confidence, claim: compatGroup(t.disaster_type.label), note: "D-Intel core (CrisisMMD-trained) reading the citizen text" });
  if (n.hazard.citizen_type) prov.push({ source: "citizen_declared_type", independence_group: "report", confidence: null, claim: compatGroup(n.hazard.citizen_type), note: "Citizen-provided; not independent from the text" });
  if (n.operational.existing_confidence !== null) prov.push({ source: "janrakshak_triage_confidence", independence_group: "report", confidence: n.operational.existing_confidence, claim: null, note: "Phone-side triage score for the same report" });
  if (n.ai.present) prov.push({ source: "phone_detector (aiDetection)", independence_group: "image", confidence: n.ai.confidence, claim: n.ai.group, note: n.ai.unknown_label ? `detector label '${n.ai.label}' not in D-Intel mapping` : "External YOLO/TFLite evidence; not replaced by D-Intel" });
  if (n.sensor.present) prov.push({ source: "sensor_consensus", independence_group: "devices", confidence: n.sensor.confidence ?? n.sensor.clusterScore, claim: "physical_anomaly", note: `${n.sensor.deviceCount ?? "?"} devices, ${n.sensor.eventType ?? "unknown event type"}` });
  if (n.location.present) prov.push({ source: "device_gps", independence_group: "device_gps", confidence: n.location.accuracy_quality === "precise" ? 0.9 : n.location.accuracy_quality === "moderate" ? 0.6 : 0.3, claim: null, note: `accuracy ${n.location.accuracyM ?? "?"} m` });

  // ---------- disaster type resolution
  const modelGroup = t ? compatGroup(t.disaster_type.label) : null;
  const citizenGroup = compatGroup(n.hazard.citizen_type);
  const textVsCitizen = agreement(modelGroup, citizenGroup);
  const textVsImage = agreement(modelGroup ?? citizenGroup, n.ai.group);
  let disaster: Record<string, unknown>;
  if (t && n.hazard.citizen_type && !n.hazard.core_supported) {
    disaster = { label: n.hazard.citizen_type, confidence: null, source: "citizen_declared", model_supported: false,
      model_prediction: { label: t.disaster_type.label, confidence: r3(t.disaster_type.confidence) },
      note: `'${n.hazard.citizen_type}' is outside the core model's trained classes (${CORE_SUPPORTED_TYPES.join(", ")}); citizen declaration retained, not scored` };
    reasons.push(`disaster type '${n.hazard.citizen_type}' is not supported by the core model — operator must confirm`);
    ood.push("unsupported_disaster_type");
  } else if (t && n.hazard.citizen_type && textVsCitizen === "aligned" && n.hazard.citizen_type !== t.disaster_type.label) {
    // same compatibility group (e.g. Flood vs Tropical cyclone): refine to the citizen's more specific type; confidence = model mass on the group
    const groupMass = Object.entries(t.disaster_type.probabilities).filter(([c]) => compatGroup(c) === modelGroup).reduce((a, [, p]) => a + p, 0);
    disaster = { label: n.hazard.citizen_type, confidence: r3(Math.min(1, groupMass)), source: "model_group_refined_by_citizen_type", model_supported: true,
      model_prediction: { label: t.disaster_type.label, confidence: r3(t.disaster_type.confidence) }, note: "model and citizen agree on hazard family; confidence is the model's probability mass on that family" };
  } else if (t) {
    disaster = { label: t.disaster_type.label, confidence: r3(t.disaster_type.confidence), source: "model", model_supported: true };
    if (textVsCitizen === "contradictory") reasons.push(`text model (${t.disaster_type.label}) disagrees with citizen-declared type (${n.hazard.citizen_type})`);
  } else if (n.hazard.citizen_type) {
    disaster = { label: n.hazard.citizen_type, confidence: null, source: "citizen_declared", model_supported: false, note: "no text available; core model not run" };
  } else {
    disaster = { label: "Unknown", confidence: null, source: "unavailable", model_supported: false };
  }
  if (n.hazard.unknown_type) { reasons.push(`unrecognised hazard type '${n.hazard.citizen_type_raw}'`); ood.push("unknown_hazard_type"); }

  // ---------- image agreement
  if (textVsImage === "contradictory") reasons.push(`phone detector evidence (${n.ai.label}) contradicts the reported hazard`);
  if (n.ai.unknown_label) reasons.push(`detector label '${n.ai.label}' is unknown to D-Intel; not used as corroboration`);
  if (n.ai.confidence_invalid) reasons.push("aiDetection.confidence outside [0,1]; clipped");
  if (n.operational.confidence_out_of_range) reasons.push("payload confidence outside [0,1]; clipped");

  // ---------- sensor relevance
  const finalType = String(disaster.label);
  const motionSensitive = SIGNAL_SENSITIVE.has(finalType) || (n.hazard.citizen_type !== null && SIGNAL_SENSITIVE.has(n.hazard.citizen_type));
  let sensorVsEvent: FusionResult["evidence_agreement"]["sensor_vs_event"] = "not_applicable";
  if (n.sensor.present) {
    const s = n.sensor.confidence ?? n.sensor.clusterScore ?? 0;
    sensorVsEvent = s >= 0.5 && (n.sensor.deviceCount ?? 0) >= 2 ? "supportive" : "weak";
    if (sensorVsEvent === "weak" && motionSensitive) reasons.push("sensor evidence present but weak for a motion-sensitive event");
  } else if (motionSensitive) {
    sensorVsEvent = "missing_for_signal_sensitive_event";
    reasons.push(`no device sensor corroboration for a motion-sensitive event (${SIGNAL_SENSITIVE.has(finalType) ? finalType : n.hazard.citizen_type})`);
  }

  // ---------- core-derived quantities
  const pInf = t ? t.informative.probabilities["informative"] ?? 0 : null;
  const sevExp = t ? Object.entries(t.damage_severity.probabilities).reduce((a, [c, p]) => a + p * (SEV_WEIGHT[c] ?? 0), 0) : null;
  const humRel = t ? Object.entries(t.humanitarian_category.probabilities).reduce((a, [c, p]) => a + p * (HUM_WEIGHT[c] ?? 0), 0) : null;

  // ---------- independent corroboration (one vote per independence group, report group excluded)
  let corroboration = 0;
  if (n.ai.present && textVsImage === "aligned" && (n.ai.confidence ?? 0) >= 0.5) corroboration += 1;
  if (sensorVsEvent === "supportive") corroboration += 1;
  if (n.location.present && n.location.accuracy_quality !== "coarse") corroboration += 1;

  // ---------- derived response priority (documented heuristic; NOT a learned output)
  const parts: Record<string, number> = {};
  let score: number; let priorityConf: number;
  if (t && sevExp !== null && humRel !== null && pInf !== null) {
    const urg = n.operational.urgency_norm;
    parts.severity = 0.45 * sevExp; parts.humanitarian = 0.25 * humRel; parts.informative = 0.15 * pInf;
    parts.citizen_urgency = urg === null ? 0.15 * (0.45 * sevExp + 0.25 * humRel + 0.15 * pInf) / 0.85 : 0.15 * urg;
    parts.corroboration = 0.05 * Math.min(3, corroboration);
    parts.contradiction = textVsImage === "contradictory" || textVsCitizen === "contradictory" ? -0.1 : 0;
    score = Object.values(parts).reduce((a, b) => a + b, 0);
    const coreConf = (t.damage_severity.confidence + t.humanitarian_category.confidence + t.informative.confidence) / 3;
    priorityConf = 0.6 * coreConf + 0.2 * (n.location.present ? (n.location.accuracy_quality === "precise" ? 1 : n.location.accuracy_quality === "moderate" ? 0.7 : 0.4) : 0.2) + 0.2 * Math.min(1, corroboration / 2);
  } else {
    const urg = n.operational.urgency_norm ?? n.operational.score_norm ?? 0.35;
    parts.citizen_urgency = urg; parts.corroboration = 0.05 * corroboration; score = urg + parts.corroboration;
    priorityConf = 0.25 + 0.1 * corroboration;
    reasons.push("no usable text — priority derived only from citizen urgency and available corroboration");
  }
  score = Math.min(1, Math.max(0, score));
  const priorityLabel = score >= 0.75 ? "CRITICAL" : score >= 0.55 ? "HIGH" : score >= 0.35 ? "MEDIUM" : "LOW";

  // ---------- review rules (conservative; never blocks the report)
  const sev = t?.damage_severity;
  if (t) {
    if (t.informative.confidence < 0.6 || t.humanitarian_category.confidence < 0.45 || sev!.confidence < 0.5) reasons.push("low calibrated confidence on at least one core task");
    if (sev!.label === "Severe" && corroboration === 0) reasons.push("high-severity assessment with no independent corroboration (no aligned image, sensor or precise location)");
    else if (sev!.label === "Severe") reasons.push("high-severity assessment requires operator verification");
    if (core!.vocab_coverage < 0.5 && core!.token_count >= 3) { ood.push("low_vocabulary_coverage"); reasons.push(`text is unfamiliar to the training domain (${Math.round(core!.vocab_coverage * 100)}% of tokens seen in training)`); }
    if (core!.token_count < 3) { ood.push("very_short_text"); reasons.push("text too short for reliable classification"); }
    if (t.disaster_type.margin < 0.3) ood.push("ambiguous_disaster_type");
    if (t.damage_severity.margin < 0.2) ood.push("ambiguous_severity");
  } else { ood.push("text_unavailable"); }
  if (!n.language.supported) { reasons.push(n.language.warning!); ood.push("unsupported_language"); }
  if (n.text.warnings.includes("very_short_text")) ood.push("very_short_text");
  if (n.mesh.relayed && !n.location.present) reasons.push("mesh-relayed incident without location fix");
  if ((priorityLabel === "CRITICAL" || priorityLabel === "HIGH") && priorityConf < 0.6) reasons.push("high operational priority with limited confidence");
  const uniqReasons = [...new Set(reasons)];

  const confs = t ? [t.informative.confidence, t.humanitarian_category.confidence, t.damage_severity.confidence, ...(disaster.confidence != null ? [disaster.confidence as number] : [])] : [];
  const overall = confs.length ? r3(confs.reduce((a, b) => a + b, 0) / confs.length) : null;

  const pack = (p: TaskPrediction | undefined) => (p ? { label: p.label, confidence: r3(p.confidence), calibration_status: p.calibration_status, probabilities: Object.fromEntries(Object.entries(p.probabilities).map(([k, v]) => [k, r3(v)])) } : { label: null, confidence: null, calibration_status: "not_run", note: "text unavailable" });

  return {
    predictions: {
      disaster_type: disaster,
      informative: pack(t?.informative),
      humanitarian_category: pack(t?.humanitarian_category),
      damage_severity: { ...pack(t?.damage_severity), label_provenance: t ? "text proxy of CrisisMMD image-level damage annotation" : undefined },
      response_priority: { label: priorityLabel, confidence: r3(priorityConf), derived: true, confidence_status: "heuristic_uncalibrated", score: r3(score) },
    },
    evidence_fusion: {
      text_confidence: t ? r3(t.disaster_type.confidence) : null,
      image_confidence: null, image_note: "D-Intel v1 has no trained image encoder; only external detector evidence is used",
      sensor_confidence: n.sensor.present ? r3(n.sensor.confidence ?? n.sensor.clusterScore ?? 0) : null,
      existing_ai_confidence: n.ai.confidence !== null ? r3(n.ai.confidence) : n.operational.existing_confidence,
      context_available: n.location.present || n.sensor.present || n.operational.urgency_norm !== null,
      independent_corroborating_groups: corroboration,
      fusion_model: FUSION_VERSION, fusion_kind: "rule_based_untrained",
    },
    evidence_provenance: prov,
    evidence_agreement: { text_vs_image: textVsImage, text_vs_citizen_type: textVsCitizen, sensor_vs_event: sensorVsEvent },
    prediction_trace: {
      text_model: t ? strength((t.informative.confidence + t.damage_severity.confidence + t.humanitarian_category.confidence) / 3) : "unavailable",
      image_model: "unavailable",
      existing_ai_evidence: n.ai.present ? strength(n.ai.confidence) : "unavailable",
      sensor_context: n.sensor.present ? strength(n.sensor.confidence ?? n.sensor.clusterScore) : "unavailable",
      location_context: n.location.present ? (n.location.accuracy_quality === "precise" ? "strong" : n.location.accuracy_quality === "moderate" ? "moderate" : "weak") : "unavailable",
      cross_modal_agreement: textVsImage === "unavailable" ? "not_applicable" : textVsImage,
    },
    review: { requires_human_review: uniqReasons.length > 0, reasons: uniqReasons },
    ood: { flags: [...new Set(ood)], vocab_coverage: core ? r3(core.vocab_coverage) : null, token_count: core?.token_count ?? null, method: "lightweight: confidence/margin thresholds + vocabulary coverage + label support (embedding-distance & conformal interfaces reserved)" },
    overall_confidence: overall,
    confidence_status: t ? "calibrated (temperature scaling on CrisisMMD dev split); priority heuristic is uncalibrated" : "uncalibrated",
    janrakshak_context: { sensor_evidence_used: n.sensor.present, ai_detection_used: n.ai.present && !n.ai.unknown_label, location_used: n.location.present, existing_urgency_used: n.operational.urgency_norm !== null, existing_score_used: n.operational.score_norm !== null, existing_confidence_used: n.operational.existing_confidence !== null, mesh_context_used: n.mesh.relayed, identity_fields_used: false },
    priority_breakdown: { ...Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, r3(v)])), formula: "0.45·E[severity] + 0.25·humanitarian_relevance + 0.15·P(informative) + 0.15·citizen_urgency + 0.05·independent_corroboration − 0.10·contradiction", thresholds: "CRITICAL≥0.75 HIGH≥0.55 MEDIUM≥0.35" },
  };
}
