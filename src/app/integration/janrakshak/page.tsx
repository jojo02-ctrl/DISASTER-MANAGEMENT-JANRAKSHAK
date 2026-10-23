import fs from "fs"; import path from "path";
import { adaptJanRakshakPayload, extractedFeatureMap } from "@/lib/dintel/adapter";
import { PageHeader, Section } from "@/components/ui";
export const dynamic = "force-dynamic";
const MAPPING: [string, string, string, string][] = [
  ["rawText", "YES", "dintel-norm-v1 → TF-IDF", "text encoder (core)"], ["description", "fallback", "tokenizer", "text encoder"], ["title", "fallback", "tokenizer", "text encoder"],
  ["type", "YES (fusion)", "taxonomy mapping → compatibility group", "agreement check / unsupported gate"], ["urgency", "YES*", "ordinal 0–1", "fusion (priority)"], ["score", "YES*", "/10 clip", "fusion (priority fallback)"],
  ["lat / lng", "YES*", "accuracy quality, India bbox (coarse only)", "location context"], ["accuracyM", "YES*", "precise/moderate/coarse", "location confidence"], ["confidence", "YES*", "clip [0,1]", "fusion (report group)"],
  ["aiDetection", "YES*", "label → group, conf clip", "fusion (image group)"], ["aiVision", "YES*", "presence", "fusion"], ["imageStorageRef", "NOT USED", "reference only", "input_summary"], ["sensorEvidence", "YES*", "SensorEvidenceEncoder (log1p / norm / clip) + mask", "fusion (devices group)"],
  ["language", "YES", "language gate", "warning"], ["meshHopCount / isMeshRouted", "OPTIONAL", "relayed flag", "review rule"], ["rawAudioBlobId", "NOT USED", "presence", "—"],
  ["userId / reporterId / userEmail", "NO", "identity — dropped", "none"], ["reviewStatus / autoDispatched / etaMinutes / acknowledged / resolved", "NO", "operational outcome — leakage risk", "none"], ["city / stateName / location", "NOT USED", "trace only", "—"],
];
export default function IntegrationPage() {
  const payload = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "janrakshak", "flood.json"), "utf-8"));
  const fm = extractedFeatureMap(adaptJanRakshakPayload(payload));
  const flow = ["JanRakshak payload", "D-Intel adapter", "Feature extraction", "ML core model (Layer A)", "Evidence fusion (Layer B)", "Prediction"];
  return (
    <div>
      <PageHeader code="05 / INTEGRATION" title="JanRakshak → D-Intel" sub="D-Intel consumes the real Firebase incident payload through an adapter; JanRakshak never has to pre-transform it. * = only used in Layer B until legitimate training data exists." />
      <div className="p-8 space-y-4">
        <div className="panel p-5 flex items-center gap-2 overflow-x-auto">{flow.map((f, i) => (<div key={f} className="flex items-center gap-2"><div className={`border rounded px-4 py-3 min-w-[150px] ${i === 3 ? "border-[var(--accent)]" : "border-[var(--line)]"}`}><p className="label">{String(i + 1).padStart(2, "0")}</p><p className="text-sm mt-0.5">{f}</p></div>{i < flow.length - 1 && <span className="text-[var(--muted)]">→</span>}</div>))}</div>
        <div className="grid xl:grid-cols-2 gap-4">
          <Section title="Actual fields extracted from tests/fixtures/janrakshak/flood.json (live adapter output)">
            <table className="w-full text-[12px]"><thead><tr className="label text-left"><th className="font-normal pb-2">field</th><th className="font-normal">role</th><th className="font-normal">value</th><th className="font-normal">component</th></tr></thead>
              <tbody>{fm.map((f) => (<tr key={f.field + f.role} className="border-t border-[var(--line)]"><td className="py-1.5 mono">{f.field}</td><td><span className={`pill ${f.used ? "pill-ok" : "pill-dim"}`}>{f.role}</span></td><td className="mono text-[11px] text-white/80">{f.value}</td><td className="text-[11px] text-[var(--muted)]">{f.component}</td></tr>))}</tbody></table>
          </Section>
          <Section title="Firebase field → transformation → model component (JANRAKSHAK_FEATURE_MAPPING.md)">
            <table className="w-full text-[12px]"><thead><tr className="label text-left"><th className="font-normal pb-2">field</th><th className="font-normal">used?</th><th className="font-normal">transformation</th><th className="font-normal">component</th></tr></thead>
              <tbody>{MAPPING.map(([f, u, t, c]) => (<tr key={f} className="border-t border-[var(--line)]"><td className="py-1.5 mono text-[11px]">{f}</td><td><span className={`pill ${u.startsWith("YES") ? "pill-ok" : u === "NO" ? "pill-bad" : "pill-dim"}`}>{u}</span></td><td className="text-[11px] text-white/80">{t}</td><td className="text-[11px] text-[var(--muted)]">{c}</td></tr>))}</tbody></table>
          </Section>
        </div>
        <div className="grid lg:grid-cols-3 gap-4">
          <Section title="Contract"><p className="mono text-[11px]">POST /api/predict/janrakshak</p><p className="text-[12px] text-[var(--muted)] mt-1">Body: the Firebase incident document / PacketPayload as-is. Missing, null, or unknown fields are tolerated. Optional header X-API-Key when DINTEL_API_KEY is set.</p></Section>
          <Section title="Two-tier design"><p className="text-[12px] text-white/80"><span className="text-[var(--ok)]">Layer A</span> — trained on public CrisisMMD: disaster type, informative, humanitarian, severity.</p><p className="text-[12px] text-white/80 mt-1"><span className="text-[var(--warn)]">Layer B</span> — JanRakshak evidence (urgency, aiDetection, sensorEvidence, location) fused by explicit rules with provenance; becomes learnable once verified_janrakshak_dataset exists.</p></Section>
          <Section title="Data flywheel (controlled)"><p className="mono text-[11px] leading-relaxed text-white/80">citizen report → ML prediction → human review → verified label → verified_janrakshak_dataset → offline retraining → new model version</p><p className="text-[11px] text-[var(--muted)] mt-1">No automatic retraining. Model output is never treated as ground truth.</p></Section>
        </div>
        <Section title="Example payload"><pre className="mono text-[11px] text-white/70 overflow-auto">{JSON.stringify(payload, null, 2)}</pre></Section>
      </div>
    </div>
  );
}
