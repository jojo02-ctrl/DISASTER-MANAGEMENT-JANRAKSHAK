import fs from "fs"; import path from "path";
import { adaptJanRakshakPayload } from "@/lib/dintel/adapter";
import { runCore } from "@/lib/dintel/core";
import { fuse } from "@/lib/dintel/fusion";
import { PageHeader, Section, pct } from "@/components/ui";
export const dynamic = "force-dynamic";
/* eslint-disable @typescript-eslint/no-explicit-any */
function Examples({ rows }: { rows: any[] }) {
  return (<div className="space-y-2">{rows.map((r, i) => (<div key={i} className="border border-[var(--line)] rounded p-3"><p className="text-[12px] text-white/85">{r.text}</p><p className="mono text-[10px] text-[var(--muted)] mt-1">true <span className="text-[var(--ok)]">{r.true}</span> · predicted <span className="text-[var(--accent)]">{r.pred}</span> · confidence {pct(r.confidence)} · {r.event}</p></div>))}</div>);
}
export default function FailuresPage() {
  const fa = JSON.parse(fs.readFileSync(path.join(process.cwd(), "reports", "failure_analysis.json"), "utf-8"));
  const c = fa.categories;
  // live cases run through the real pipeline right now (not cached)
  const live = ["earthquake", "fire", "contradictory_vision", "landslide", "sensor_missing"].map((n) => { const p = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "janrakshak", `${n}.json`), "utf-8")); const inc = adaptJanRakshakPayload(p); const out = fuse(inc, inc.text.present ? runCore(inc.text.value!) : null); return { n, text: inc.text.value, citizen: inc.hazard.citizen_type, out }; });
  return (
    <div>
      <PageHeader code="04 / FAILURE ANALYSIS" title="Where the model fails" sub="Real held-out test examples and live fixture runs. These are shown deliberately: an operator tool must know its own failure modes." />
      <div className="p-8 space-y-4">
        <Section title="Live: hazard-family failures on JanRakshak fixtures (computed now by the deployed pipeline)">
          <div className="grid lg:grid-cols-2 gap-3">{live.map((l) => { const d: any = l.out.predictions.disaster_type; return (<div key={l.n} className="border border-[var(--line)] rounded p-3"><p className="mono text-[10px] text-[var(--muted)]">{l.n}.json · citizen type {l.citizen ?? "—"}</p><p className="text-[12px] text-white/85 mt-1">{l.text}</p><p className="mono text-[10px] mt-1">final <span className={d.model_supported && l.citizen && d.label !== l.citizen ? "text-[var(--accent)]" : "text-[var(--ok)]"}>{d.label}</span>{d.model_prediction ? ` · model said ${d.model_prediction.label} @ ${pct(d.model_prediction.confidence)}` : d.confidence != null ? ` @ ${pct(d.confidence)}` : ""} · text↔image {l.out.evidence_agreement.text_vs_image} · sensor {l.out.evidence_agreement.sensor_vs_event} · review {String(l.out.review.requires_human_review)}</p></div>); })}</div>
          <p className="text-[11px] text-[var(--muted)] mt-3">Observed failure mode: 74% of CrisisMMD training tweets come from three hurricanes, so text without an explicit hazard word (e.g. “cracks after strong shaking”, “smoke… wind is pushing it”) is pulled toward <span className="text-white/80">Tropical cyclone</span>. The fusion layer catches the disagreement with the citizen-declared type and routes to review, but it does not fix the underlying prior. Mitigation path: JanRakshak-verified data + transformer encoder.</p>
        </Section>
        <div className="grid xl:grid-cols-2 gap-4">
          <Section title="High-confidence wrong predictions · disaster_type"><Examples rows={c["disaster_type/high_confidence_wrong"]} /></Section>
          <Section title="Severe under-prediction · damage_severity (true Severe)"><Examples rows={c["damage_severity/severe_underprediction"]} /></Section>
          <Section title="High-confidence wrong · humanitarian_category"><Examples rows={c["humanitarian_category/high_confidence_wrong"]} /></Section>
          <Section title="Low-confidence events · informative"><Examples rows={c["informative/low_confidence"]} /></Section>
        </div>
        <div className="grid xl:grid-cols-2 gap-4">
          <Section title="Text / image disagreement present in the dataset itself" right={<span className="mono text-[10px] text-[var(--muted)]">{c.text_image_disagreement_rate_test.disagreeing_pairs}/{c.text_image_disagreement_rate_test.total_pairs} test pairs disagree</span>}>
            <div className="space-y-2">{c.text_image_disagreement_in_dataset.map((r: any) => (<div key={r.id} className="border border-[var(--line)] rounded p-3"><p className="text-[12px] text-white/85">{r.text}</p><p className="mono text-[10px] text-[var(--muted)] mt-1">text label {r.label_text} · image label {r.label_image}</p></div>))}</div>
            <p className="text-[11px] text-[var(--muted)] mt-2">Annotators labelled text and image of the same tweet differently in these cases — the reason D-Intel treats modalities as separate evidence and never assumes agreement.</p>
          </Section>
          <div className="space-y-4">
            <Section title="Unsupported categories"><p className="text-[12px] text-white/80">{c["disaster_type/unsupported_categories"].note}</p><p className="mono text-[11px] text-[var(--muted)] mt-2">supported: {c["disaster_type/unsupported_categories"].supported.join(", ")}</p></Section>
            <Section title="Error rate by event (test) · disaster_type / damage_severity">
              <table className="w-full mono text-[11px]"><thead><tr className="label text-left"><th className="font-normal pb-1">event</th><th className="font-normal">type err</th><th className="font-normal">severity err</th></tr></thead>
                <tbody>{Object.keys(c["disaster_type/error_rate_by_event"]).map((e) => (<tr key={e} className="border-t border-[var(--line)]"><td className="py-1">{e}</td><td>{pct(c["disaster_type/error_rate_by_event"][e].error_rate, 1)} (n={c["disaster_type/error_rate_by_event"][e].n})</td><td>{c["damage_severity/error_rate_by_event"][e] ? `${pct(c["damage_severity/error_rate_by_event"][e].error_rate, 1)} (n=${c["damage_severity/error_rate_by_event"][e].n})` : "—"}</td></tr>))}</tbody></table>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
