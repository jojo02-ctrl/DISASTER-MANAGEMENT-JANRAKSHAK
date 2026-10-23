import { apiError, checkAuth, ok, options, readJson, withTimeout } from "@/lib/dintel/http";
import { adaptJanRakshakPayload } from "@/lib/dintel/adapter";
import { buildResponse, persist } from "@/lib/dintel/predictor";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function POST(req: Request) {
  const auth = checkAuth(req); if (auth) return auth;
  const started = Date.now();
  const { data, error } = await readJson(req); if (error) return error;
  if (!data || typeof data !== "object" || Array.isArray(data)) return apiError(422, "validation_error", "JanRakshak payload must be a JSON object");
  try {
    const incident = adaptJanRakshakPayload(data);
    const p = data as Record<string, unknown>;
    const image = incident.ai.image_ref ? { present: true, source: "reference" as const, url: incident.ai.image_ref } : { present: false, source: "none" as const };
    const resp = await withTimeout(Promise.resolve(buildResponse({ endpoint: "/predict/janrakshak", incident, image, startedAt: started })));
    await persist(resp, incident.text.value);
    return ok({ ...resp, trace: { incident_code: typeof p.incidentCode === "string" ? p.incidentCode : null, source: incident.operational.source, mesh: incident.mesh } });
  } catch (e) { return apiError(500, "inference_error", (e as Error).message); }
}
