import { apiError, checkAuth, ok, options, readJson, withTimeout } from "@/lib/dintel/http";
import { buildResponse, incidentFromText, persist } from "@/lib/dintel/predictor";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function POST(req: Request) {
  const auth = checkAuth(req); if (auth) return auth;
  const started = Date.now();
  const { data, error } = await readJson(req); if (error) return error;
  const body = (data ?? {}) as { text?: unknown; type?: string; language?: string };
  if (typeof body.text !== "string") return apiError(422, "validation_error", "`text` (string) is required");
  if (body.text.length > 5000) return apiError(422, "validation_error", "`text` exceeds 5000 characters");
  try {
    const resp = await withTimeout(Promise.resolve(buildResponse({ endpoint: "/predict/text", incident: incidentFromText(body.text, body), startedAt: started })));
    await persist(resp, body.text);
    return ok(resp);
  } catch (e) { return apiError(500, "inference_error", (e as Error).message); }
}
