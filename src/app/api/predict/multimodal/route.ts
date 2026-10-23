import { ALLOWED_IMAGE_MIME, MAX_IMAGE_BYTES, apiError, checkAuth, ok, options, withTimeout } from "@/lib/dintel/http";
import { buildResponse, incidentFromText, persist } from "@/lib/dintel/predictor";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
/** multipart/form-data: text (string), type?, image (file) | image_url. Image is validated (MIME, size, magic bytes) but v1 has no trained image encoder. */
export async function POST(req: Request) {
  const auth = checkAuth(req); if (auth) return auth;
  const started = Date.now();
  let form: FormData;
  try { form = await req.formData(); } catch { return apiError(400, "malformed_multipart", "expected multipart/form-data"); }
  const text = String(form.get("text") ?? "");
  const type = form.get("type") ? String(form.get("type")) : undefined;
  const file = form.get("image");
  const imageUrl = form.get("image_url") ? String(form.get("image_url")) : null;
  const validation: string[] = [];
  let image = { present: false, source: "none" as "none" | "upload" | "url", mime: null as string | null, bytes: null as number | null, url: imageUrl, validation };
  if (file && typeof file === "object" && "arrayBuffer" in file) {
    const f = file as File;
    if (!ALLOWED_IMAGE_MIME.has(f.type)) return apiError(415, "unsupported_media_type", `image MIME ${f.type || "unknown"} not allowed`);
    if (f.size > MAX_IMAGE_BYTES) return apiError(413, "image_too_large", `image exceeds ${MAX_IMAGE_BYTES} bytes`);
    const head = new Uint8Array((await f.arrayBuffer()).slice(0, 12));
    const isJpeg = head[0] === 0xff && head[1] === 0xd8, isPng = head[0] === 0x89 && head[1] === 0x50, isWebp = head[8] === 0x57 && head[9] === 0x45;
    if (!(isJpeg || isPng || isWebp)) return apiError(415, "invalid_image", "file signature does not match an allowed image type");
    validation.push("mime_ok", "size_ok", "signature_ok");
    image = { ...image, present: true, source: "upload", mime: f.type, bytes: f.size };
  } else if (imageUrl) {
    if (!/^https?:\/\//.test(imageUrl) && !/^gs:\/\//.test(imageUrl)) return apiError(422, "validation_error", "image_url must be http(s) or gs:// reference");
    image = { ...image, present: true, source: "url" };
  }
  if (!text && !image.present) return apiError(422, "validation_error", "provide text and/or image");
  try {
    const resp = await withTimeout(Promise.resolve(buildResponse({ endpoint: "/predict/multimodal", incident: incidentFromText(text, { type }), image, startedAt: started })));
    await persist(resp, text || null);
    return ok(resp);
  } catch (e) { return apiError(500, "inference_error", (e as Error).message); }
}
