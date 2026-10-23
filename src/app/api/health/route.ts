import { ok, cors } from "@/lib/dintel/http";
import { coreModelInfo } from "@/lib/dintel/core";
import { db } from "@/db";
import { sql } from "drizzle-orm";
export const dynamic = "force-dynamic";
export async function GET() {
  let dbOk = false;
  try { await db.execute(sql`select 1`); dbOk = true; } catch { dbOk = false; }
  let model: string | null = null;
  try { model = coreModelInfo().model_version; } catch { model = null; }
  return ok({ status: model ? "ok" : "degraded", model_loaded: !!model, model_version: model, database: dbOk ? "ok" : "unavailable", timestamp: new Date().toISOString() });
}
export function OPTIONS() { return new Response(null, { status: 204, headers: cors() }); }
