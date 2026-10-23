import fs from "fs"; import path from "path";
import { apiError } from "@/lib/dintel/http";
export const dynamic = "force-dynamic";
const ALLOWED = new Set(["dataset_report.html", "training_report.html", "evaluation_report.html", "failure_analysis.html", "metrics.json", "dataset_report.json", "training_report.json", "failure_analysis.json", "calibration_report.json"]);
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!ALLOWED.has(name)) return apiError(404, "not_found", "unknown report");
  const body = fs.readFileSync(path.join(process.cwd(), "reports", name), "utf-8");
  return new Response(body, { headers: { "Content-Type": name.endsWith(".json") ? "application/json" : "text/html; charset=utf-8" } });
}
