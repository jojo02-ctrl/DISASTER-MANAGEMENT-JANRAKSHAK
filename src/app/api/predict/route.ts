import { apiError, checkAuth, ok, options, readJson, withTimeout } from "@/lib/dintel/http";
import { adaptJanRakshakPayload } from "@/lib/dintel/adapter";
import { buildResponse, incidentFromText, persist } from "@/lib/dintel/predictor";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
/** Generic entry: {text, type?, language?, image_url?} OR {payload: <JanRakshak object>} */
export async function POST(req: Request) {
  const auth = checkAuth(req); if (auth) return auth;
  const started = Date.now();
  const { data, error } = await readJson(req); if (error) return error;
  const b = (data ?? {}) as { text?: unknown; type?: string; language?: string; image_url?: string; payload?: unknown };
  const incident = b.payload ? adaptJanRakshakPayload(b.payload) : typeof b.text === "string" ? incidentFromText(b.text, b) : null;
  if (!incident) return apiError(422, "validation_error", "provide `text` or `payload`");
  const image = b.image_url ? { present: true, source: "url" as const, url: String(b.image_url).slice(0, 2048) } : { present: false, source: "none" as const };
  try {
    const resp = await withTimeout(Promise.resolve(buildResponse({ endpoint: "/predict", incident, image, startedAt: started })));
    await persist(resp, incident.text.value);
    return ok(resp);
  } catch (e) { return apiError(500, "inference_error", (e as Error).message); }
}
