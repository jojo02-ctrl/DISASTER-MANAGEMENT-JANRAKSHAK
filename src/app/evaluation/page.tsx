import fs from "fs"; import path from "path";
import { PageHeader, Section, f3 } from "@/components/ui";
import { CandidateChart, ReliabilityChart, ConfusionMatrix } from "@/components/Charts";
export const dynamic = "force-dynamic";
/* eslint-disable @typescript-eslint/no-explicit-any */
export default function EvaluationPage() {
  const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), "reports", "metrics.json"), "utf-8"));
  const ds = JSON.parse(fs.readFileSync(path.join(process.cwd(), "reports", "dataset_report.json"), "utf-8"));
  const tasks = Object.keys(m.tasks);
  const cands = Object.keys(m.dev_selection.informative);
  const chart = cands.map((c) => ({ candidate: c.replace("tfidf_", ""), ...Object.fromEntries(tasks.map((t) => [t, +m.dev_selection[t][c].macro_f1.toFixed(3)])) }));
  const exps = Object.entries(m.experiments as Record<string, any>);
  return (
    <div>
      <PageHeader code="03 / EVALUATION" title="Evaluation" sub={`${m.split}. Model selection used the dev split only. All numbers are measured; experiments that could not be run are marked not_conducted.`} />
      <div className="p-8 space-y-4">
        <Section title="Dataset (CrisisMMD v2.0, after tweet-level de-duplication and cross-split contamination removal)">
          <table className="w-full text-[12px] mono"><thead><tr className="label text-left"><th className="font-normal pb-2">task</th><th className="font-normal">train</th><th className="font-normal">dev</th><th className="font-normal">test</th><th className="font-normal">label source</th></tr></thead>
            <tbody>{Object.entries(ds.tasks as Record<string, any>).map(([t, v]) => (<tr key={t} className="border-t border-[var(--line)]"><td className="py-1.5">{t}</td><td>{v.train.n}</td><td>{v.dev.n}</td><td>{v.test.n}</td><td className="text-[var(--muted)] text-[11px]">{v.label_source}</td></tr>))}</tbody></table>
          <p className="text-[11px] text-[var(--muted)] mt-2">Train rows removed for overlap with dev/test: informative {ds.contamination_control.informative.removed_overlap_with_dev_test}, humanitarian {ds.contamination_control.humanitarian.removed_overlap_with_dev_test}, damage {ds.contamination_control.damage.removed_overlap_with_dev_test}. Class distributions in <a className="underline" href="/api/reports/dataset_report.html" target="_blank">dataset_report.html</a>.</p>
        </Section>
        <div className="grid xl:grid-cols-2 gap-4">
          <Section title="Baseline comparison — dev macro-F1 per candidate (selection basis)"><CandidateChart data={chart} /></Section>
          <Section title="Held-out test results (selected model per task)">
            <table className="w-full text-[12px] mono"><thead><tr className="label text-left"><th className="font-normal pb-2">task</th><th className="font-normal">acc</th><th className="font-normal">macro P</th><th className="font-normal">macro R</th><th className="font-normal">macro F1</th><th className="font-normal">wF1</th><th className="font-normal">ECE</th><th className="font-normal">Brier</th></tr></thead>
              <tbody>{tasks.map((t) => { const v = m.tasks[t]; return (<tr key={t} className="border-t border-[var(--line)]"><td className="py-1.5">{t}</td><td>{f3(v.accuracy)}</td><td>{f3(v.macro_precision)}</td><td>{f3(v.macro_recall)}</td><td className="text-white">{f3(v.macro_f1)}</td><td>{f3(v.weighted_f1)}</td><td>{f3(v.calibration.ece_calibrated)}</td><td>{f3(v.calibration.brier_calibrated)}</td></tr>); })}</tbody></table>
            <div className="grid grid-cols-2 gap-3 mt-4 text-[12px]">
              <div className="panel p-3"><p className="label">informative (binary)</p><p className="mono mt-1">ROC-AUC {f3(m.tasks.informative.roc_auc)} · PR-AUC {f3(m.tasks.informative.pr_auc)}</p></div>
              <div className="panel p-3"><p className="label">damage severity — severe class</p><p className="mono mt-1">recall {f3(m.tasks.damage_severity.severe_recall)} · precision {f3(m.tasks.damage_severity.severe_precision)} · F1 {f3(m.tasks.damage_severity.severe_f1)}</p><p className="mono text-[var(--accent)]">severe under-prediction rate {f3(m.tasks.damage_severity.severe_underprediction_rate)}</p></div>
            </div>
            <p className="text-[11px] text-[var(--muted)] mt-3">Response priority: {m.response_priority.note}</p>
          </Section>
        </div>
        <div className="grid xl:grid-cols-2 gap-4">
          {tasks.map((t) => (<Section key={t} title={`Confusion matrix · ${t} (test)`}><ConfusionMatrix labels={m.tasks[t].confusion_matrix.labels} matrix={m.tasks[t].confusion_matrix.matrix} />
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-0.5 mono text-[10px]">{Object.entries(m.tasks[t].per_class as Record<string, any>).map(([c, v]) => <p key={c} className="flex justify-between"><span className="text-[var(--muted)] truncate mr-2">{c}</span><span>P {f3(v.precision)} R {f3(v.recall)} n={v.support}</span></p>)}</div></Section>))}
        </div>
        <div className="grid xl:grid-cols-2 gap-4">
          {tasks.map((t) => (<Section key={t} title={`Reliability diagram · ${t} (test, after temperature scaling T=${m.tasks[t].calibration.temperature.toFixed(2)})`} right={<span className="mono text-[10px] text-[var(--muted)]">ECE {f3(m.tasks[t].calibration.ece_uncalibrated)} → {f3(m.tasks[t].calibration.ece_calibrated)}</span>}><ReliabilityChart data={m.tasks[t].calibration.reliability_diagram} /></Section>))}
        </div>
        <Section title="Cross-modal & ablation experiments — honest status">
          <div className="grid md:grid-cols-2 gap-3">{exps.map(([k, v]) => (<div key={k} className="panel p-3"><div className="flex items-center justify-between"><p className="mono text-[12px]">{k}</p><span className={`pill ${v.status === "conducted" ? "pill-ok" : "pill-dim"}`}>{v.status}</span></div><p className="text-[11px] text-[var(--muted)] mt-1">{v.note ?? v.reason}</p></div>))}</div>
          <p className="text-[11px] text-[var(--muted)] mt-3">The JanRakshak feature ablation (Δ macro-F1, Δ severe recall, Δ calibration, Δ review rate for +urgency, +AI confidence, +sensorEvidence, +location) requires a human-verified JanRakshak dataset; the collection mechanism exists (verified_janrakshak_dataset) but no such data exists yet, so no improvement from JanRakshak evidence is claimed.</p>
        </Section>
      </div>
    </div>
  );
}
