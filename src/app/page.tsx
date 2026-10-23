import fs from "fs";
import path from "path";
import Link from "next/link";
import { db } from "@/db";
import { predictions } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { coreModelInfo } from "@/lib/dintel/core";
import { PageHeader, Stat, Section, pct, f3, Bar } from "@/components/ui";
import ConfidenceChart from "@/components/ConfidenceChart";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const info = coreModelInfo();
  const metrics = JSON.parse(fs.readFileSync(path.join(process.cwd(), "reports", "metrics.json"), "utf-8"));
  const ds = JSON.parse(fs.readFileSync(path.join(process.cwd(), "reports", "dataset_report.json"), "utf-8"));
  const [agg] = await db.select({
    total: sql<number>`count(*)::int`, high: sql<number>`count(*) filter (where ${predictions.responsePriority} in ('HIGH','CRITICAL'))::int`,
    review: sql<number>`count(*) filter (where ${predictions.requiresHumanReview} and ${predictions.reviewStatus}='pending')::int`,
    text: sql<number>`count(*) filter (where ${predictions.textAvailable})::int`, image: sql<number>`count(*) filter (where ${predictions.imageAvailable})::int`,
    sensor: sql<number>`count(*) filter (where ${predictions.sensorAvailable})::int`, loc: sql<number>`count(*) filter (where ${predictions.locationAvailable})::int`,
    avgConf: sql<number>`coalesce(avg(${predictions.overallConfidence}),0)::float`,
  }).from(predictions);
  const hist = await db.select({ bucket: sql<number>`least(9, floor(coalesce(${predictions.overallConfidence},0)*10))::int`, n: sql<number>`count(*)::int` }).from(predictions).groupBy(sql`1`).orderBy(sql`1`);
  const recent = await db.select({ id: predictions.requestId, ep: predictions.endpoint, dt: predictions.disasterType, sev: predictions.damageSeverity, pr: predictions.responsePriority, rev: predictions.requiresHumanReview, conf: predictions.overallConfidence, at: predictions.createdAt }).from(predictions).orderBy(desc(predictions.createdAt)).limit(8);
  const tasks = metrics.tasks as Record<string, { macro_f1: number; accuracy: number; calibration: { ece_calibrated: number }; severe_recall?: number; roc_auc?: number; n_test: number; selected_model: string }>;
  const buckets = Array.from({ length: 10 }, (_, i) => ({ bucket: `${i * 10}–${i * 10 + 10}`, n: hist.find((h) => h.bucket === i)?.n ?? 0 }));
  const mod = (n: number) => (agg.total ? n / agg.total : 0);

  return (
    <div>
      <PageHeader code="00 / OVERVIEW" title="Disaster Intelligence Engine" sub="Turn disaster reports into actionable intelligence. Layer A is trained on CrisisMMD v2; Layer B fuses JanRakshak evidence with explicit, documented rules."
        right={<Link href="/analyze" className="mono text-xs tracking-widest border border-[var(--accent)] text-[var(--accent)] px-4 py-2 rounded hover:bg-[var(--accent)] hover:text-black transition-colors">ANALYZE INCIDENT →</Link>} />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <Stat label="Core model" value={<span className="text-base">{info.model_version}</span>} sub={`trained ${info.training_timestamp.slice(0, 10)}`} />
          <Stat label="Status" value={<span className="text-base">DEPLOYED</span>} sub="fusion: rule-based v1" tone="ok" />
          <Stat label="Dataset" value={<span className="text-base">CrisisMMD v2</span>} sub={`${ds.tasks.informative.train.n + ds.tasks.informative.dev.n + ds.tasks.informative.test.n} tweets · 7 events`} />
          <Stat label="Predictions analyzed" value={agg.total} sub={`avg confidence ${pct(agg.avgConf)}`} />
          <Stat label="High / critical priority" value={agg.high} sub="derived operational layer" tone="accent" />
          <Stat label="Human-review queue" value={agg.review} sub="pending operator decisions" tone="warn" />
        </div>

        <div className="grid xl:grid-cols-3 gap-4">
          <Section title="Latest evaluation — held-out CrisisMMD test split" className="xl:col-span-2">
            <table className="w-full text-sm">
              <thead><tr className="label text-left"><th className="pb-2 font-normal">task</th><th className="font-normal">model</th><th className="font-normal">n</th><th className="font-normal">macro F1</th><th className="font-normal">acc</th><th className="font-normal">ECE</th><th className="font-normal">extra</th></tr></thead>
              <tbody className="mono text-[13px]">
                {Object.entries(tasks).map(([t, m]) => (
                  <tr key={t} className="border-t border-[var(--line)]"><td className="py-2 text-white/90">{t}</td><td className="text-[var(--muted)] text-[11px]">{m.selected_model}</td><td>{m.n_test}</td>
                    <td><div className="flex items-center gap-2"><span className="w-12">{f3(m.macro_f1)}</span><div className="w-24"><Bar v={m.macro_f1} /></div></div></td>
                    <td>{f3(m.accuracy)}</td><td>{f3(m.calibration.ece_calibrated)}</td>
                    <td className="text-[var(--muted)] text-[11px]">{m.severe_recall != null ? `severe recall ${f3(m.severe_recall)}` : m.roc_auc != null ? `ROC-AUC ${f3(m.roc_auc)}` : ""}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-[var(--muted)] mt-3">response_priority has no ground-truth labels and is therefore not evaluated as a learned task. Image, multimodal and transformer experiments were <span className="text-white/70">not conducted</span> in this build (see Evaluation).</p>
          </Section>
          <Section title="Modality availability (served requests)">
            {[["text", agg.text], ["image (received, not analysed)", agg.image], ["sensor evidence", agg.sensor], ["location", agg.loc]].map(([l, n]) => (
              <div key={String(l)} className="mb-3"><div className="flex justify-between text-xs mb-1"><span>{l}</span><span className="mono text-[var(--muted)]">{n as number} · {pct(mod(n as number))}</span></div><Bar v={mod(n as number)} /></div>
            ))}
          </Section>
        </div>

        <div className="grid xl:grid-cols-3 gap-4">
          <Section title="Confidence distribution (overall, calibrated core tasks)"><ConfidenceChart data={buckets} /></Section>
          <Section title="Recent predictions" className="xl:col-span-2">
            {recent.length === 0 ? <p className="text-sm text-[var(--muted)]">No predictions yet. Run one from the Analyze screen.</p> : (
              <table className="w-full text-[12px] mono">
                <thead><tr className="label text-left"><th className="pb-2 font-normal">request</th><th className="font-normal">endpoint</th><th className="font-normal">type</th><th className="font-normal">severity</th><th className="font-normal">priority</th><th className="font-normal">conf</th><th className="font-normal">review</th></tr></thead>
                <tbody>{recent.map((r) => (<tr key={r.id} className="border-t border-[var(--line)]"><td className="py-1.5 text-[var(--muted)]">{r.id.slice(0, 8)}</td><td>{r.ep}</td><td>{r.dt}</td><td>{r.sev ?? "—"}</td><td className={r.pr === "CRITICAL" || r.pr === "HIGH" ? "text-[var(--accent)]" : ""}>{r.pr}</td><td>{pct(r.conf)}</td><td>{r.rev ? <span className="pill pill-warn">review</span> : <span className="pill pill-dim">auto</span>}</td></tr>))}</tbody>
              </table>)}
          </Section>
        </div>
      </div>
    </div>
  );
}
