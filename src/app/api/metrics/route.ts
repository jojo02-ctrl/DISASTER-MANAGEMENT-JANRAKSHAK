import { ok } from "@/lib/dintel/http";
import { db } from "@/db";
import { apiMetrics, predictions } from "@/db/schema";
import { sql } from "drizzle-orm";
import { coreModelInfo } from "@/lib/dintel/core";
import { FUSION_VERSION } from "@/lib/dintel/fusion";
export const dynamic = "force-dynamic";
export async function GET() {
  const [agg] = await db.select({
    requests: sql<number>`count(*)::int`, avg_latency_ms: sql<number>`coalesce(avg(${apiMetrics.latencyMs}),0)::float`,
    p95_latency_ms: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${apiMetrics.latencyMs}),0)::float`,
    errors: sql<number>`count(*) filter (where ${apiMetrics.status} >= 400)::int`,
    low_confidence: sql<number>`count(*) filter (where ${apiMetrics.lowConfidence})::int`,
  }).from(apiMetrics);
  const byEndpoint = await db.select({ endpoint: apiMetrics.endpoint, n: sql<number>`count(*)::int` }).from(apiMetrics).groupBy(apiMetrics.endpoint);
  const [mod] = await db.select({
    text: sql<number>`count(*) filter (where ${predictions.textAvailable})::int`, image: sql<number>`count(*) filter (where ${predictions.imageAvailable})::int`,
    sensor: sql<number>`count(*) filter (where ${predictions.sensorAvailable})::int`, location: sql<number>`count(*) filter (where ${predictions.locationAvailable})::int`,
    review: sql<number>`count(*) filter (where ${predictions.requiresHumanReview})::int`, total: sql<number>`count(*)::int`,
  }).from(predictions);
  return ok({ model_version: coreModelInfo().model_version, fusion_version: FUSION_VERSION, api: { ...agg, low_confidence_rate: agg.requests ? agg.low_confidence / agg.requests : 0, by_endpoint: byEndpoint }, modality_availability: mod, privacy: { raw_text_logged: process.env.LOG_RAW_TEXT === "true" } });
}
