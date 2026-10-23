import { apiError, checkAuth, ok, options, readJson } from "@/lib/dintel/http";
import { db } from "@/db";
import { predictions, verifiedTrainingRecords } from "@/db/schema";
import { eq } from "drizzle-orm";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
/** Operator review. Body: {request_id, decision: "confirmed"|"corrected"|"dismissed", labels?: {...}, text?: string, verified_by?: string}
 *  Only explicit human decisions create rows in verified_janrakshak_dataset. Model output is never auto-promoted. */
export async function PATCH(req: Request) {
  const auth = checkAuth(req); if (auth) return auth;
  const { data, error } = await readJson(req); if (error) return error;
  const b = (data ?? {}) as { request_id?: string; decision?: string; labels?: Record<string, string>; text?: string; verified_by?: string };
  if (!b.request_id || !["confirmed", "corrected", "dismissed"].includes(b.decision ?? "")) return apiError(422, "validation_error", "request_id and decision (confirmed|corrected|dismissed) required");
  const [row] = await db.select().from(predictions).where(eq(predictions.requestId, b.request_id));
  if (!row) return apiError(404, "not_found", "unknown request_id");
  await db.update(predictions).set({ reviewStatus: b.decision! }).where(eq(predictions.requestId, b.request_id));
  if (b.decision !== "dismissed") {
    const l = b.decision === "corrected" ? (b.labels ?? {}) : { disaster_type: row.disasterType ?? undefined, humanitarian_category: row.humanitarianCategory ?? undefined, damage_severity: row.damageSeverity ?? undefined, response_priority: row.responsePriority ?? undefined };
    await db.insert(verifiedTrainingRecords).values({ reportId: b.request_id, requestId: b.request_id, text: b.text ?? row.rawTextLogged ?? null, disasterType: l.disaster_type ?? null, humanitarianCategory: l.humanitarian_category ?? null, damageSeverity: l.damage_severity ?? null, responsePriority: l.response_priority ?? null, modelFeatures: { model_version: row.modelVersion, fusion_version: row.fusionVersion }, humanVerified: true, verifiedBy: b.verified_by ?? "operator" });
  }
  return ok({ request_id: b.request_id, review_status: b.decision, added_to_verified_dataset: b.decision !== "dismissed" });
}
