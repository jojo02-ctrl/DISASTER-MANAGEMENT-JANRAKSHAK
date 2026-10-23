import type { ReactNode } from "react";
export function PageHeader({ code, title, sub, right }: { code: string; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="px-8 pt-8 pb-5 border-b border-[var(--line)] flex items-end justify-between gap-6">
      <div><p className="label mono">{code}</p><h1 className="text-2xl font-medium tracking-tight mt-1">{title}</h1>{sub && <p className="text-sm text-[var(--muted)] mt-1 max-w-3xl">{sub}</p>}</div>
      {right}
    </div>
  );
}
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: "accent" | "ok" | "warn" }) {
  const c = tone === "accent" ? "text-[var(--accent)]" : tone === "ok" ? "text-[var(--ok)]" : tone === "warn" ? "text-[var(--warn)]" : "text-white";
  return (<div className="panel p-4"><p className="label">{label}</p><p className={`mono text-2xl mt-2 ${c}`}>{value}</p>{sub && <p className="text-[11px] text-[var(--muted)] mt-1">{sub}</p>}</div>);
}
export function Section({ title, children, right, className }: { title: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (<section className={`panel ${className ?? ""}`}><div className="flex items-center justify-between px-5 py-3 border-b border-[var(--line)]"><p className="label">{title}</p>{right}</div><div className="p-5">{children}</div></section>);
}
export const pct = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`);
export const f3 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(3));
export function Bar({ v, tone = "bg-white/70" }: { v: number | null | undefined; tone?: string }) {
  return (<div className="h-1 w-full bg-white/[0.06] rounded"><div className={`h-1 rounded ${tone}`} style={{ width: `${Math.max(0, Math.min(100, (v ?? 0) * 100))}%` }} /></div>);
}
