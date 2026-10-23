"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Overview", code: "00" },
  { href: "/analyze", label: "Analyze", code: "01" },
  { href: "/models", label: "Model Lab", code: "02" },
  { href: "/evaluation", label: "Evaluation", code: "03" },
  { href: "/failures", label: "Failure Analysis", code: "04" },
  { href: "/integration/janrakshak", label: "JanRakshak Integration", code: "05" },
];

export default function Shell({ children, modelVersion }: { children: ReactNode; modelVersion: string }) {
  const path = usePathname();
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r border-[var(--line)] bg-[#070708] flex flex-col sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-[var(--line)]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm bg-[var(--accent)]" />
            <span className="mono text-sm tracking-[0.25em] font-semibold">D-INTEL</span>
          </div>
          <p className="label mt-2">Disaster Intelligence Engine</p>
        </div>
        <nav className="flex-1 py-3">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`flex items-center gap-3 px-5 py-2.5 text-[13px] transition-colors ${active ? "text-white bg-white/[0.04] border-r-2 border-[var(--accent)]" : "text-[var(--muted)] hover:text-white"}`}>
                <span className="mono text-[10px] opacity-60">{n.code}</span>{n.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-[var(--line)] space-y-1">
          <p className="label">Deployed model</p>
          <p className="mono text-[11px] text-white/80">{modelVersion}</p>
          <p className="mono text-[11px] text-white/50">dintel-fusion-v1.0.0 · rules</p>
          <div className="flex items-center gap-2 pt-1"><span className="h-1.5 w-1.5 rounded-full bg-[var(--ok)]" /><span className="text-[11px] text-[var(--muted)]">inference online</span></div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 grid-bg">{children}</main>
    </div>
  );
}
