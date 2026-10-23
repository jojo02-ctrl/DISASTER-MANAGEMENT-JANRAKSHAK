import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import Shell from "@/components/Shell";
import { coreModelInfo } from "@/lib/dintel/core";

export const metadata: Metadata = { title: "D-Intel — Disaster Intelligence Engine", description: "Turn disaster reports into actionable intelligence." };

export default function RootLayout({ children }: { children: ReactNode }) {
  let v = "model not loaded";
  try { v = coreModelInfo().model_version; } catch { /* degraded */ }
  return (
    <html lang="en"><body className="antialiased"><Shell modelVersion={v}>{children}</Shell></body></html>
  );
}
