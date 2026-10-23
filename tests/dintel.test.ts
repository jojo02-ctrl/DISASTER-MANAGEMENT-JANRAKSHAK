/** Contract tests: every fixture and edge case goes through the REAL adapter → core model → fusion pipeline.
 *  Run: npx tsx --test tests/dintel.test.ts */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs"; import path from "path";
import { adaptJanRakshakPayload } from "../src/lib/dintel/adapter";
import { runCore, normalizeText } from "../src/lib/dintel/core";
import { fuse } from "../src/lib/dintel/fusion";

const dir = path.join(process.cwd(), "tests", "fixtures", "janrakshak");
const run = (payload: unknown) => { const n = adaptJanRakshakPayload(payload); const core = n.text.present ? runCore(n.text.value!) : null; return { n, core, out: fuse(n, core) }; };
const noNaN = (o: unknown) => { const s = JSON.stringify(o); assert.ok(!/NaN|Infinity/.test(s), "response contains NaN/Infinity"); };
const conf01 = (o: unknown) => { JSON.stringify(o, (k, v) => { if (k === "confidence" && v !== null) assert.ok(v >= 0 && v <= 1, `confidence out of range ${v}`); return v; }); };

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
  test(`fixture ${f} runs through the full pipeline`, () => {
    const payload = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
    const { out } = run(payload);
    noNaN(out); conf01(out);
    assert.ok(["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes((out.predictions.response_priority as { label: string }).label));
    assert.equal(out.janrakshak_context.identity_fields_used, false);
    assert.ok(!JSON.stringify(out).includes("logits"));
  });
}
test("flood fixture: hazard family hydro, sensor + ai + location used, review flagged", () => {
  const { out } = run(JSON.parse(fs.readFileSync(path.join(dir, "flood.json"), "utf-8")));
  const d = out.predictions.disaster_type as { label: string };
  assert.ok(["Flood", "Tropical cyclone", "Storm"].includes(d.label));
  assert.equal(out.janrakshak_context.sensor_evidence_used, true);
  assert.equal(out.janrakshak_context.ai_detection_used, true);
  assert.equal(out.janrakshak_context.location_used, true);
  assert.equal(out.evidence_agreement.text_vs_image, "aligned");
  assert.equal(out.evidence_fusion.independent_corroborating_groups, 3);
});
test("identity fields are dropped and never used", () => {
  const { n } = run({ rawText: "flooding here", userId: "u1", reporterId: "r1", userEmail: "e@x" });
  assert.deepEqual(n.ignored_identity_fields, ["userId", "reporterId", "userEmail"]);
});
test("empty text -> core not run, priority from urgency, review required", () => {
  const { n, core, out } = run({ rawText: "   ", urgency: "HIGH" });
  assert.equal(n.text.present, false); assert.equal(core, null);
  assert.equal(out.review.requires_human_review, true);
  assert.equal((out.predictions.informative as { label: null }).label, null);
});
test("missing sensorEvidence -> mask 0, not deviceCount 0", () => {
  const { n } = run({ rawText: "shaking" });
  assert.equal(n.sensor.present, false); assert.equal(n.sensor.deviceCount, null); assert.deepEqual(n.sensor.features, { sensor_present: 0 });
});
test("signal-sensitive event without sensor evidence is flagged", () => {
  const { out } = run(JSON.parse(fs.readFileSync(path.join(dir, "sensor_missing.json"), "utf-8")));
  assert.equal(out.evidence_agreement.sensor_vs_event, "missing_for_signal_sensitive_event");
  assert.ok(out.review.reasons.some((r) => r.includes("sensor corroboration")));
});
test("missing lat/lng and invalid coordinates", () => {
  assert.equal(run({ rawText: "fire" }).n.location.present, false);
  assert.equal(run({ rawText: "fire", lat: 0, lng: 0 }).n.location.present, false);
  assert.equal(run({ rawText: "fire", lat: 95, lng: 10 }).n.location.present, false);
  assert.equal(run({ rawText: "fire", lat: "19.1", lng: "72.8" }).n.location.present, true);
});
test("unknown type -> flagged, unsupported type -> citizen label retained w/o confidence", () => {
  const u = run({ rawText: "something strange happened", type: "Meteor strike" });
  assert.equal(u.n.hazard.unknown_type, true); assert.ok(u.out.ood.flags.includes("unknown_hazard_type"));
  const l = run(JSON.parse(fs.readFileSync(path.join(dir, "landslide.json"), "utf-8")));
  const d = l.out.predictions.disaster_type as { label: string; confidence: number | null; model_supported: boolean };
  assert.equal(d.label, "Landslide"); assert.equal(d.confidence, null); assert.equal(d.model_supported, false);
  assert.ok(l.out.ood.flags.includes("unsupported_disaster_type"));
});
test("confidence outside [0,1] is clipped and flagged; unknown detector label not used", () => {
  const { n, out } = run(JSON.parse(fs.readFileSync(path.join(dir, "unknown_type_hindi.json"), "utf-8")));
  assert.equal(n.operational.existing_confidence, 1); assert.equal(n.operational.confidence_out_of_range, true);
  assert.equal(n.ai.confidence, 0); assert.equal(n.ai.confidence_invalid, true); assert.equal(n.ai.unknown_label, true);
  assert.equal(out.janrakshak_context.ai_detection_used, false);
  assert.equal(n.language.supported, false); assert.ok(out.ood.flags.includes("unsupported_language"));
});
test("contradictory text/image -> contradictory + review", () => {
  const { out } = run(JSON.parse(fs.readFileSync(path.join(dir, "contradictory_vision.json"), "utf-8")));
  assert.equal(out.evidence_agreement.text_vs_image, "contradictory");
  assert.ok(out.review.reasons.some((r) => r.includes("contradicts")));
});
test("weak/contradictory sensor evidence flagged for motion-sensitive event", () => {
  const { out } = run({ rawText: "strong shaking, walls cracked", type: "Earthquake", sensorEvidence: { deviceCount: 1, clusterScore: 0.1, confidence: 0.1 } });
  assert.equal(out.evidence_agreement.sensor_vs_event, "weak");
});
test("mesh relayed / anonymous incident without location", () => {
  const { n, out } = run(JSON.parse(fs.readFileSync(path.join(dir, "mesh_relayed.json"), "utf-8")));
  assert.equal(n.mesh.relayed, true); assert.equal(n.mesh.hopCount, 3);
  assert.ok(n.ignored_operational_fields.includes("reviewStatus"));
  assert.ok(out.review.reasons.some((r) => r.includes("mesh-relayed")));
});
test("scenario texts map to sensible hazard families (labels only, no numeric assertions)", () => {
  const fam = (t: string) => runCore(t).tasks.disaster_type.label;
  assert.ok(["Flood", "Tropical cyclone"].includes(fam("This road is flooded and cars are stranded.")));
  assert.equal(fam("Large cracks appeared after strong shaking, earthquake felt across the city."), "Earthquake");
  assert.equal(fam("Smoke and flames are visible near the forest, wildfire spreading."), "Wildfire");
  const chem = run({ rawText: "Chemical smell and people having difficulty breathing", type: "Chemical hazard" });
  assert.equal((chem.out.predictions.disaster_type as { label: string }).label, "Chemical hazard");
  assert.equal(chem.out.review.requires_human_review, true);
});
test("normalizer parity fixtures", () => {
  assert.equal(normalizeText("RT @Cal_OES: PLS SHARE: We’re here: https://t.co/x #Napa"), "user pls share we're here url napa");
});
test("no-text, no-type payload does not crash", () => { const { out } = run({}); noNaN(out); assert.equal(out.review.requires_human_review, true); });
test("malformed inputs handled by adapter", () => { noNaN(run(null).out); noNaN(run([1, 2]).out); noNaN(run("string").out); });
