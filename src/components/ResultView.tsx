"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import { Bar, pct } from "@/components/ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = any;

const strengthTone: Record<string, string> = { strong: "pill-ok", moderate: "pill-warn", weak: "pill-bad", unavailable: "pill-dim", aligned: "pill-ok", partially_aligned: "pill-warn", contradictory: "pill-bad", not_applicable: "pill-dim", supportive: "pill-ok", missing_for_signal_sensitive_event: "pill-bad" };
const prioTone: Record<string, string> = { CRITICAL: "text-[var(--accent)]", HIGH: "text-[var(--accent)]", MEDIUM: "text-[var(--warn)]", LOW: "text-white/80" };

function Pipeline({ r }: { r: R }) {
  const steps = [
    { n: "Incoming payload", s: `${r.input_summary.text_available ? "text" : "no text"}${r.input_summary.sensor_evidence_available ? " · sensor" : ""}${r.input_summary.existing_ai_evidence_available ? " · aiDetection" : ""}${r.input_summary.location_available ? " · location" : ""}`, on: true },
    { n: "Feature extraction", s: `${r.feature_map.filter((f: R) => f.used).length}/${r.feature_map.length} fields used · ${r.adapter.ignored_identity_fields.length} identity dropped`, on: true },
    { n: "Text analysis", s: r.core_diagnostics ? `${r.core_diagnostics.token_count} tokens · ${pct(r.core_diagnostics.vocab_coverage)} in vocab` : "skipped (no text)", on: !!r.core_diagnostics },
    { n: "Vision analysis", s: r.input_summary.image_available ? "image received · encoder not trained in v1" : r.input_summary.existing_ai_evidence_available ? "external detector evidence only" : "unavailable", on: r.input_summary.existing_ai_evidence_available },
    { n: "Sensor / context", s: r.input_summary.sensor_evidence_available ? `${r.prediction_trace.sensor_context} consensus` : "no sensor evidence (mask=0)", on: r.input_summary.sensor_evidence_available || r.input_summary.location_available },
    { n: "Evidence fusion", s: `${r.evidence_fusion.independent_corroborating_groups} independent corroborating group(s)`, on: true },
    { n: "Final prediction", s: `${r.predictions.response_priority.label} · ${r.review.requires_human_review ? "review" : "auto"}`, on: true },
  ];
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
      {steps.map((s, i) => (
        <motion.div key={s.n} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="flex items-center gap-1 min-w-0">
          <div className={`panel px-3 py-2 min-w-[150px] ${s.on ? "" : "opacity-40"}`}><p className="label">{String(i + 1).padStart(2, "0")}</p><p className="text-xs mt-0.5 text-white/90">{s.n}</p><p className="mono text-[10px] text-[var(--muted)] mt-1 truncate" title={s.s}>{s.s}</p></div>
          {i < steps.length - 1 && <span className="text-[var(--muted)] text-xs px-0.5">→</span>}
        </motion.div>
      ))}
    </div>
  );
}

function PredCard({ title, p, extra }: { title: string; p: R; extra?: string }) {
  return (
    <div className="panel p-4 flex flex-col gap-2">
      <p className="label">{title}</p>
      <div className="flex items-baseline justify-between gap-2">
        <p className={`text-base font-medium leading-tight ${title === "RESPONSE PRIORITY" ? prioTone[p.label] ?? "" : "text-white"}`}>{p.label ?? "—"}</p>
        <p className="mono text-sm text-white/70">{p.confidence == null ? "n/a" : pct(p.confidence)}</p>
      </div>
      <Bar v={p.confidence} tone={title === "RESPONSE PRIORITY" ? "bg-[var(--accent)]" : "bg-white/70"} />
      <p className="text-[10px] text-[var(--muted)] leading-snug">{extra ?? (p.derived ? "derived · heuristic, uncalibrated" : p.source === "citizen_declared" ? "citizen-declared · outside core model" : p.source === "model_group_refined_by_citizen_type" ? "model family · refined by citizen type" : p.calibration_status?.startsWith("calibrated") ? "calibrated · temperature scaling" : p.calibration_status ?? "")}</p>
    </div>
  );
}

export default function ResultView({ r, onReviewed }: { r: R; onReviewed?: () => void }) {
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const p = r.predictions;
  const review = async (decision: string) => {
    const res = await fetch("/api/review", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_id: r.request_id, decision, verified_by: "dashboard-operator" }) });
    const j = await res.json(); setReviewMsg(res.ok ? `recorded: ${j.review_status}${j.added_to_verified_dataset ? " → verified dataset" : ""}` : j.error?.message); onReviewed?.();
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="label">Pipeline · request {r.request_id.slice(0, 8)} · {r.latency_ms} ms</p><p className="mono text-[10px] text-[var(--muted)]">{r.model_version} + {r.fusion_version}</p></div>
      <Pipeline r={r} />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <PredCard title="DISASTER TYPE" p={p.disaster_type} />
        <PredCard title="INFORMATIVE" p={p.informative} />
        <PredCard title="HUMANITARIAN CATEGORY" p={p.humanitarian_category} />
        <PredCard title="DAMAGE SEVERITY" p={p.damage_severity} extra={p.damage_severity.label ? "calibrated · text proxy of image-level label" : undefined} />
        <PredCard title="RESPONSE PRIORITY" p={p.response_priority} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="panel p-5 lg:col-span-2">
          <p className="label mb-3">Evidence panel — evidence, not automatic truth</p>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-white/80 mb-1">TEXT EVIDENCE <span className={`pill ml-2 ${strengthTone[r.prediction_trace.text_model]}`}>{r.prediction_trace.text_model}</span></p>
              {r.explanation ? (
                <div className="space-y-1">{r.explanation.disaster_type.slice(0, 6).map((t: R) => (<div key={t.token} className="flex items-center gap-2 mono text-[11px]"><span className="w-28 truncate text-white/80">{t.token}</span><div className="flex-1 h-1 bg-white/[0.06] rounded"><div className={`h-1 rounded ${t.contribution >= 0 ? "bg-[var(--ok)]" : "bg-[var(--accent)]"}`} style={{ width: `${Math.min(100, Math.abs(t.contribution) * 60)}%` }} /></div><span className="w-12 text-right text-[var(--muted)]">{t.contribution.toFixed(3)}</span></div>))}
                  <p className="text-[10px] text-[var(--muted)] mt-1">token contribution (w·x) toward {p.disaster_type.model_prediction?.label ?? p.disaster_type.label}</p></div>
              ) : <p className="text-[var(--muted)] text-xs">no text supplied</p>}
            </div>
            <div className="space-y-3">
              <div><p className="text-xs text-white/80">IMAGE EVIDENCE <span className={`pill ml-2 ${strengthTone[r.prediction_trace.image_model]}`}>{r.prediction_trace.image_model}</span></p><p className="text-[11px] text-[var(--muted)]">{r.input_summary.image_analysis}</p></div>
              <div><p className="text-xs text-white/80">EXISTING AI EVIDENCE <span className={`pill ml-2 ${strengthTone[r.prediction_trace.existing_ai_evidence]}`}>{r.prediction_trace.existing_ai_evidence}</span></p>
                {r.evidence_provenance.filter((e: R) => e.independence_group === "image").map((e: R) => <p key={e.source} className="mono text-[11px] text-[var(--muted)]">{e.source}: {e.note} · conf {e.confidence ?? "—"}</p>)}
                <p className="text-[11px] text-[var(--muted)]">text vs image: <span className={`pill ${strengthTone[r.evidence_agreement.text_vs_image]}`}>{r.evidence_agreement.text_vs_image}</span></p></div>
              <div><p className="text-xs text-white/80">SENSOR CONSENSUS <span className={`pill ml-2 ${strengthTone[r.prediction_trace.sensor_context]}`}>{r.prediction_trace.sensor_context}</span></p>
                {r.input_summary.sensor_evidence_available ? <p className="mono text-[11px] text-[var(--muted)]">{Math.round(Math.expm1(r.adapter.sensor_features.device_count_log1p))} devices · {Math.round(r.adapter.sensor_features.cluster_radius_norm * 500)}m cluster · {pct(r.adapter.sensor_features.sensor_agreement)} agreement · <span className={`pill ${strengthTone[r.evidence_agreement.sensor_vs_event]}`}>{r.evidence_agreement.sensor_vs_event}</span></p> : <p className="text-[11px] text-[var(--muted)]">unavailable · sensor_present = 0</p>}</div>
              <div><p className="text-xs text-white/80">LOCATION CONTEXT <span className={`pill ml-2 ${strengthTone[r.prediction_trace.location_context]}`}>{r.prediction_trace.location_context}</span></p><p className="mono text-[11px] text-[var(--muted)]">{r.input_summary.location_available ? `${r.adapter.location_context.accuracy_quality} fix${r.adapter.location_context.city ? ` · ${r.adapter.location_context.city}` : ""}${r.adapter.location_context.in_india_bbox ? " · India bbox" : ""}` : "no location fix"}</p></div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--line)]">
            <p className="label mb-2">Evidence provenance (same independence_group is never double-counted)</p>
            <div className="flex flex-wrap gap-2">{r.evidence_provenance.map((e: R) => (<span key={e.source} className="mono text-[10px] border border-[var(--line)] rounded px-2 py-1 text-white/70">{e.source} <span className="text-[var(--muted)]">· {e.independence_group}{e.confidence != null ? ` · ${pct(e.confidence)}` : ""}</span></span>))}</div>
          </div>
        </div>

        <div className="space-y-4">
          <div className={`panel p-5 border ${r.review.requires_human_review ? "border-[rgba(251,191,36,.35)]" : "border-[rgba(52,211,153,.3)]"}`}>
            <p className="label">Review panel</p>
            <p className="text-sm mt-1">Model recommends: <span className={`font-medium ${r.review.requires_human_review ? "text-[var(--warn)]" : "text-[var(--ok)]"}`}>{r.review.requires_human_review ? "HUMAN REVIEW" : "AUTO-ROUTE (still visible to operators)"}</span></p>
            <ul className="mt-2 space-y-1">{r.review.reasons.map((x: string) => <li key={x} className="text-[12px] text-white/75 flex gap-2"><span className="text-[var(--warn)]">•</span>{x}</li>)}</ul>
            {r.ood.flags.length > 0 && <p className="mono text-[10px] text-[var(--muted)] mt-2">ood: {r.ood.flags.join(", ")}</p>}
            <p className="text-[10px] text-[var(--muted)] mt-2">Uncertainty never rejects a report — it routes it to an operator.</p>
            <div className="flex gap-2 mt-3">{["confirmed", "corrected", "dismissed"].map((d) => <button key={d} onClick={() => review(d)} className="mono text-[10px] tracking-widest uppercase border border-[var(--line)] px-2 py-1 rounded hover:border-white/40">{d}</button>)}</div>
            {reviewMsg && <p className="mono text-[10px] text-[var(--ok)] mt-2">{reviewMsg}</p>}
          </div>
          <div className="panel p-5">
            <p className="label">What influenced this assessment?</p>
            <div className="mt-2 space-y-1">{Object.entries(r.prediction_trace).map(([k, v]) => (<div key={k} className="flex justify-between text-[12px]"><span className="text-[var(--muted)]">{k}</span><span className={`pill ${strengthTone[String(v)] ?? "pill-dim"}`}>{String(v)}</span></div>))}</div>
            <p className="label mt-4">Priority breakdown (derived)</p>
            <div className="mt-1 space-y-0.5 mono text-[11px]">{Object.entries(r.priority_breakdown).filter(([, v]) => typeof v === "number").map(([k, v]) => (<div key={k} className="flex justify-between"><span className="text-[var(--muted)]">{k}</span><span>{(v as number).toFixed(3)}</span></div>))}</div>
            <p className="text-[10px] text-[var(--muted)] mt-2">{r.priority_breakdown.formula}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3"><p className="label">overall confidence {pct(r.overall_confidence)} · {r.confidence_status}</p><button onClick={() => setShowRaw(!showRaw)} className="mono text-[10px] text-[var(--muted)] underline">{showRaw ? "hide" : "show"} raw response</button></div>
      {showRaw && <pre className="panel p-4 mono text-[10px] overflow-auto max-h-96 text-white/70">{JSON.stringify(r, null, 2)}</pre>}
    </div>
  );
}
