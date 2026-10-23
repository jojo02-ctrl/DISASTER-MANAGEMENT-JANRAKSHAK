/**
 * JanRakshak Firebase payload adapter (Layer 0).
 * Converts the REAL PacketPayload / incident document shape into a NormalizedIncident.
 * - tolerant to missing/null fields (the mobile serializer strips nulls, empty lists, and false values)
 * - identity fields (userId, reporterId, userEmail) are dropped: never features, only a trace flag
 * - never fabricates evidence: every block carries a `present` flag (modality mask)
 */

export const DISASTER_TAXONOMY = [
  "Flood", "Storm", "Tropical cyclone", "Earthquake", "Landslide", "Wildfire", "Extreme temperature",
  "Drought", "Pollution", "Chemical hazard", "Emergency / SOS", "Infrastructure", "Other environmental hazard",
] as const;
export type DisasterType = (typeof DISASTER_TAXONOMY)[number];

/** Classes the CORE model was actually trained on (CrisisMMD events). Everything else = unsupported by Layer A. */
export const CORE_SUPPORTED_TYPES: DisasterType[] = ["Flood", "Tropical cyclone", "Earthquake", "Wildfire"];

/** Compatibility groups used to judge agreement between citizen type / detector label / model prediction. */
const COMPAT_GROUPS: Record<string, string> = {
  Flood: "hydro", Storm: "hydro", "Tropical cyclone": "hydro",
  Earthquake: "geo", Landslide: "geo",
  Wildfire: "fire", "Extreme temperature": "climate", Drought: "climate",
  Pollution: "hazmat", "Chemical hazard": "hazmat",
  "Emergency / SOS": "emergency", Infrastructure: "infra", "Other environmental hazard": "other",
};
export const compatGroup = (t: string | null) => (t ? COMPAT_GROUPS[t] ?? "other" : null);

const TYPE_ALIASES: Record<string, DisasterType> = {
  flood: "Flood", flooding: "Flood", flashflood: "Flood", "flash flood": "Flood", waterlogging: "Flood", inundation: "Flood",
  storm: "Storm", thunderstorm: "Storm", hailstorm: "Storm", "heavy rain": "Storm", rain: "Storm", lightning: "Storm",
  cyclone: "Tropical cyclone", hurricane: "Tropical cyclone", typhoon: "Tropical cyclone", "tropical cyclone": "Tropical cyclone", "tropical storm": "Tropical cyclone",
  earthquake: "Earthquake", quake: "Earthquake", tremor: "Earthquake", seismic: "Earthquake",
  landslide: "Landslide", mudslide: "Landslide", rockfall: "Landslide", "land slide": "Landslide",
  wildfire: "Wildfire", "forest fire": "Wildfire", fire: "Wildfire", bushfire: "Wildfire", "building fire": "Wildfire", blaze: "Wildfire",
  heatwave: "Extreme temperature", "heat wave": "Extreme temperature", "cold wave": "Extreme temperature", "extreme temperature": "Extreme temperature", heat: "Extreme temperature",
  drought: "Drought", "water scarcity": "Drought",
  pollution: "Pollution", smog: "Pollution", "air quality": "Pollution", "air pollution": "Pollution",
  chemical: "Chemical hazard", "chemical hazard": "Chemical hazard", "gas leak": "Chemical hazard", hazmat: "Chemical hazard", "toxic": "Chemical hazard",
  emergency: "Emergency / SOS", sos: "Emergency / SOS", medical: "Emergency / SOS", accident: "Emergency / SOS",
  infrastructure: "Infrastructure", "building collapse": "Infrastructure", collapse: "Infrastructure", "bridge collapse": "Infrastructure", "power outage": "Infrastructure",
  other: "Other environmental hazard", environmental: "Other environmental hazard",
};

export function mapDisasterType(raw: unknown): { mapped: DisasterType | null; raw: string | null; core_supported: boolean; unknown: boolean } {
  if (typeof raw !== "string" || !raw.trim()) return { mapped: null, raw: null, core_supported: false, unknown: false };
  const key = raw.trim().toLowerCase().replace(/[_-]+/g, " ");
  const exact = (DISASTER_TAXONOMY as readonly string[]).find((t) => t.toLowerCase() === key) as DisasterType | undefined;
  let mapped: DisasterType | null = exact ?? TYPE_ALIASES[key] ?? null;
  if (!mapped) {
    const hit = Object.keys(TYPE_ALIASES).sort((a, b) => b.length - a.length).find((k) => key.includes(k));
    mapped = hit ? TYPE_ALIASES[hit] : null;
  }
  return { mapped, raw: raw.trim(), core_supported: mapped ? CORE_SUPPORTED_TYPES.includes(mapped) : false, unknown: !mapped };
}

/** Detector labels (YOLO/TFLite classes) -> disaster compatibility group. Unknown labels -> null (never guessed). */
const DETECTOR_LABEL_GROUP: Record<string, string> = {
  water: "hydro", flood: "hydro", flooding: "hydro", flooded_road: "hydro", flooded: "hydro", rain: "hydro", storm: "hydro", cyclone: "hydro",
  fire: "fire", flame: "fire", flames: "fire", smoke: "fire", wildfire: "fire", burning: "fire",
  rubble: "geo", debris: "geo", collapsed_building: "geo", crack: "geo", cracks: "geo", landslide: "geo", earthquake: "geo", mud: "geo",
  smog: "hazmat", haze: "hazmat", chemical: "hazmat", gas: "hazmat", spill: "hazmat",
  person: "emergency", people: "emergency", crowd: "emergency", injured: "emergency", ambulance: "emergency",
  damaged_building: "infra", damaged_road: "infra", bridge: "infra", building: "infra", vehicle: "infra", car: "infra", pole: "infra", wire: "infra",
};
export const detectorGroup = (label: string | null) => (label ? DETECTOR_LABEL_GROUP[label.toLowerCase().replace(/[\s-]+/g, "_")] ?? null : null);

const URGENCY_SCALE: Record<string, number> = { low: 0.25, medium: 0.5, moderate: 0.5, high: 0.75, critical: 1.0, emergency: 1.0 };

const clip01 = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
};
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export interface NormalizedIncident {
  text: { present: boolean; value: string | null; source: "rawText" | "description" | "title" | "unavailable"; warnings: string[] };
  language: { declared: string | null; normalized: "en" | "en-IN" | "hi" | "multi" | "unknown"; supported: boolean; warning: string | null };
  hazard: { citizen_type_raw: string | null; citizen_type: DisasterType | null; core_supported: boolean; unknown_type: boolean };
  operational: { urgency: string | null; urgency_norm: number | null; score: number | null; score_norm: number | null; existing_confidence: number | null; source: string | null; pending_scoring: boolean; confidence_out_of_range: boolean };
  ai: { present: boolean; label: string | null; confidence: number | null; model: string | null; group: string | null; unknown_label: boolean; confidence_invalid: boolean; vision: Record<string, unknown> | null; image_ref: string | null };
  sensor: { present: boolean; deviceCount: number | null; clusterRadiusMeters: number | null; eventDurationMs: number | null; clusterScore: number | null; sensorAgreement: number | null; spatialCorrelation: number | null; temporalCorrelation: number | null; confidence: number | null; eventType: string | null; features: Record<string, number> };
  location: { present: boolean; lat: number | null; lng: number | null; accuracyM: number | null; accuracy_quality: "precise" | "moderate" | "coarse" | "unknown"; city: string | null; state: string | null; locality: string | null; status: string | null; in_india_bbox: boolean | null; coordinates_valid: boolean };
  mesh: { relayed: boolean; hopCount: number | null; origin: string | null };
  audio: { present: boolean };
  ignored_identity_fields: string[];
  ignored_operational_fields: string[];
  unknown_fields: string[];
}

const KNOWN_FIELDS = new Set([
  "title", "description", "type", "urgency", "score", "city", "stateName", "state", "location", "lat", "lng", "accuracyM", "language", "userId", "source",
  "pendingScoring", "rawText", "confidence", "aiDetection", "aiVision", "imageStorageRef", "rawAudioBlobId", "sensorEvidence", "geo", "locationStatus",
  "reporterId", "reviewStatus", "userEmail", "incidentCode", "autoDispatched", "requiresAdminReview", "acknowledged", "resolved", "etaMinutes", "log",
  "timestamp", "createdAt", "isMeshRouted", "meshOrigin", "meshRelayPath", "meshPacketHash", "meshHopCount", "id", "incidentId",
]);
const IDENTITY_FIELDS = ["userId", "reporterId", "userEmail"];
const OPERATIONAL_STATE_FIELDS = ["reviewStatus", "autoDispatched", "requiresAdminReview", "acknowledged", "resolved", "etaMinutes", "log", "incidentCode", "meshPacketHash", "meshRelayPath", "timestamp", "createdAt", "pendingScoring"];

export function adaptJanRakshakPayload(payload: unknown): NormalizedIncident {
  const p = obj(payload) ?? {};
  // ---- text precedence: rawText > description > title
  const warnings: string[] = [];
  let source: NormalizedIncident["text"]["source"] = "unavailable";
  let value: string | null = null;
  for (const k of ["rawText", "description", "title"] as const) {
    const v = str(p[k]);
    if (v) { source = k; value = v; break; }
  }
  if (value && value.replace(/\s+/g, " ").trim().length < 8) warnings.push("very_short_text");
  if (value && /\uFFFD/.test(value)) { value = value.replace(/\uFFFD/g, " "); warnings.push("encoding_artifacts_removed"); }

  // ---- language
  const declared = str(p.language);
  const l = (declared ?? "").toLowerCase();
  const normalized: NormalizedIncident["language"]["normalized"] = !l ? "unknown" : l === "en-in" ? "en-IN" : l.startsWith("en") ? "en" : l.startsWith("hi") ? "hi" : l === "multi" ? "multi" : "unknown";
  const supported = normalized === "en" || normalized === "en-IN" || normalized === "unknown";
  const langWarning = supported ? (normalized === "unknown" && declared ? `language '${declared}' not recognised; treated as English` : null)
    : `core model v1 is English-only (CrisisMMD); declared language '${declared}' is not supported — predictions may be unreliable`;

  // ---- hazard
  const t = mapDisasterType(p.type);

  // ---- operational
  const urgency = str(p.urgency);
  const score = num(p.score);
  const rawConf = num(p.confidence);
  const operational: NormalizedIncident["operational"] = {
    urgency, urgency_norm: urgency ? URGENCY_SCALE[urgency.toLowerCase()] ?? null : null,
    score, score_norm: score === null ? null : Math.min(1, Math.max(0, score > 1 ? score / 10 : score)),
    existing_confidence: clip01(rawConf), source: str(p.source), pending_scoring: p.pendingScoring === true,
    confidence_out_of_range: rawConf !== null && (rawConf < 0 || rawConf > 1),
  };

  // ---- AI / vision evidence (external, never assumed)
  const ai = obj(p.aiDetection);
  const aiConfRaw = ai ? num(ai.confidence) : null;
  const aiLabel = ai ? str(ai.label) : null;
  const aiBlock: NormalizedIncident["ai"] = {
    present: !!(ai && (aiLabel || aiConfRaw !== null)) || !!obj(p.aiVision),
    label: aiLabel, confidence: clip01(aiConfRaw), model: ai ? str(ai.model) : null, group: detectorGroup(aiLabel),
    unknown_label: !!aiLabel && detectorGroup(aiLabel) === null, confidence_invalid: aiConfRaw !== null && (aiConfRaw < 0 || aiConfRaw > 1),
    vision: obj(p.aiVision), image_ref: str(p.imageStorageRef),
  };

  // ---- sensor evidence (aggregated only; raw IMU never exists here)
  const s = obj(p.sensorEvidence);
  const sensorPresent = !!s && Object.keys(s).length > 0;
  const dc = s ? num(s.deviceCount) : null, cr = s ? num(s.clusterRadiusMeters) : null, ed = s ? num(s.eventDurationMs) : null;
  const sensor: NormalizedIncident["sensor"] = {
    present: sensorPresent, deviceCount: dc, clusterRadiusMeters: cr, eventDurationMs: ed,
    clusterScore: s ? clip01(s.clusterScore) : null, sensorAgreement: s ? clip01(s.sensorAgreement) : null,
    spatialCorrelation: s ? clip01(s.spatialCorrelation) : null, temporalCorrelation: s ? clip01(s.temporalCorrelation) : null,
    confidence: s ? clip01(s.confidence) : null, eventType: s ? str(s.eventType) : null,
    features: sensorPresent ? {
      sensor_present: 1,
      device_count_log1p: dc === null ? 0 : Math.log1p(Math.max(0, dc)),
      cluster_radius_norm: cr === null ? 0 : Math.min(1, Math.max(0, cr) / 500),
      event_duration_log1p: ed === null ? 0 : Math.log1p(Math.max(0, ed)),
      cluster_score: s ? clip01(s.clusterScore) ?? 0 : 0,
      sensor_agreement: s ? clip01(s.sensorAgreement) ?? 0 : 0,
      spatial_correlation: s ? clip01(s.spatialCorrelation) ?? 0 : 0,
      temporal_correlation: s ? clip01(s.temporalCorrelation) ?? 0 : 0,
      sensor_confidence: s ? clip01(s.confidence) ?? 0 : 0,
    } : { sensor_present: 0 },
  };

  // ---- location (privacy-aware: only coarse context leaves the adapter)
  const geo = obj(p.geo);
  const lat = num(p.lat) ?? (geo ? num(geo.lat) ?? num(geo.latitude) : null);
  const lng = num(p.lng) ?? (geo ? num(geo.lng) ?? num(geo.longitude) : null);
  const acc = num(p.accuracyM) ?? (geo ? num(geo.accuracyM) : null);
  const valid = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  const location: NormalizedIncident["location"] = {
    present: valid, lat: valid ? lat : null, lng: valid ? lng : null, accuracyM: acc,
    accuracy_quality: !valid || acc === null ? "unknown" : acc <= 25 ? "precise" : acc <= 150 ? "moderate" : "coarse",
    city: str(p.city), state: str(p.stateName) ?? str(p.state), locality: str(p.location), status: str(p.locationStatus),
    in_india_bbox: valid ? lat! >= 6 && lat! <= 37.5 && lng! >= 68 && lng! <= 97.5 : null, coordinates_valid: valid,
  };

  const mesh = { relayed: p.isMeshRouted === true || num(p.meshHopCount) !== null, hopCount: num(p.meshHopCount), origin: str(p.meshOrigin) };
  return {
    text: { present: !!value, value, source, warnings }, language: { declared, normalized, supported, warning: langWarning },
    hazard: { citizen_type_raw: t.raw, citizen_type: t.mapped, core_supported: t.core_supported, unknown_type: t.unknown },
    operational, ai: aiBlock, sensor, location, mesh, audio: { present: !!str(p.rawAudioBlobId) },
    ignored_identity_fields: IDENTITY_FIELDS.filter((k) => k in p),
    ignored_operational_fields: OPERATIONAL_STATE_FIELDS.filter((k) => k in p),
    unknown_fields: Object.keys(p).filter((k) => !KNOWN_FIELDS.has(k)),
  };
}

/** The "features extracted" view shown in the dashboard / integration page. */
export function extractedFeatureMap(n: NormalizedIncident) {
  return [
    { field: n.text.source === "unavailable" ? "rawText/description/title" : n.text.source, role: "TEXT", used: n.text.present, component: "text_encoder (core model)", value: n.text.present ? `${n.text.value!.length} chars` : "unavailable" },
    { field: "type", role: "HAZARD CONTEXT", used: !!n.hazard.citizen_type, component: "taxonomy mapping → agreement check (fusion)", value: n.hazard.citizen_type ? `${n.hazard.citizen_type_raw} → ${n.hazard.citizen_type}${n.hazard.core_supported ? "" : " (not in core model)"}` : n.hazard.unknown_type ? `unknown '${n.hazard.citizen_type_raw}'` : "absent" },
    { field: "urgency", role: "OPERATIONAL CONTEXT", used: n.operational.urgency_norm !== null, component: "fusion (priority)", value: n.operational.urgency ?? "absent" },
    { field: "score", role: "OPERATIONAL CONTEXT", used: n.operational.score_norm !== null, component: "fusion (priority)", value: n.operational.score === null ? "absent" : String(n.operational.score) },
    { field: "confidence", role: "EXISTING AI EVIDENCE", used: n.operational.existing_confidence !== null, component: "fusion (evidence)", value: n.operational.existing_confidence === null ? "absent" : n.operational.existing_confidence.toFixed(2) },
    { field: "aiDetection", role: "EXISTING AI EVIDENCE", used: n.ai.present, component: "fusion (evidence_agreement)", value: n.ai.present ? `${n.ai.label ?? "?"} @ ${n.ai.confidence?.toFixed(2) ?? "?"}` : "absent" },
    { field: "sensorEvidence", role: "SENSOR CONTEXT", used: n.sensor.present, component: "SensorEvidenceEncoder → fusion", value: n.sensor.present ? `${n.sensor.deviceCount ?? "?"} devices · ${n.sensor.eventType ?? "?"}` : "absent (mask=0)" },
    { field: "lat/lng/accuracyM", role: "LOCATION CONTEXT", used: n.location.present, component: "location adapter → fusion (location confidence)", value: n.location.present ? `${n.location.accuracy_quality} fix` : "absent" },
    { field: "language", role: "LANGUAGE GATE", used: true, component: "language support check", value: `${n.language.declared ?? "unspecified"} → ${n.language.supported ? "supported" : "UNSUPPORTED"}` },
    { field: "meshHopCount", role: "TRANSPORT CONTEXT", used: n.mesh.relayed, component: "fusion (optional)", value: n.mesh.relayed ? `relayed · ${n.mesh.hopCount ?? "?"} hops` : "direct" },
    { field: "userId / reporterId / userEmail", role: "IDENTITY", used: false, component: "none (audit only)", value: n.ignored_identity_fields.length ? `${n.ignored_identity_fields.join(", ")} dropped` : "absent" },
  ];
}
