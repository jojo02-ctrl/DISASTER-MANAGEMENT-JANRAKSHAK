import { NextResponse } from "next/server";

export const MAX_JSON_BYTES = Number(process.env.MAX_JSON_BYTES ?? 262144); // 256 KB
export const MAX_IMAGE_BYTES = Number(process.env.MAX_IMAGE_BYTES ?? 5 * 1024 * 1024);
export const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
export const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 15000);

export function apiError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details: details ?? null }, timestamp: new Date().toISOString() }, { status, headers: cors() });
}
export function cors() {
  return { "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-API-Key" };
}
export function ok(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: cors() }); }
export function options() { return new NextResponse(null, { status: 204, headers: cors() }); }

/** Optional API key: enforced only when DINTEL_API_KEY is set. */
export function checkAuth(req: Request) {
  const key = process.env.DINTEL_API_KEY;
  if (!key) return null;
  if (req.headers.get("x-api-key") !== key) return apiError(401, "unauthorized", "missing or invalid X-API-Key");
  return null;
}

export async function readJson(req: Request): Promise<{ data?: unknown; error?: ReturnType<typeof apiError> }> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_JSON_BYTES) return { error: apiError(413, "payload_too_large", `JSON payload exceeds ${MAX_JSON_BYTES} bytes`) };
  const text = await req.text();
  if (text.length > MAX_JSON_BYTES) return { error: apiError(413, "payload_too_large", `JSON payload exceeds ${MAX_JSON_BYTES} bytes`) };
  if (!text.trim()) return { error: apiError(400, "empty_body", "request body is empty") };
  try { return { data: JSON.parse(text) }; } catch (e) { return { error: apiError(400, "malformed_json", "request body is not valid JSON", (e as Error).message) }; }
}

export async function withTimeout<T>(p: Promise<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("request timed out")), ms); });
  try { return await Promise.race([p, timeout]); } finally { if (timer) clearTimeout(timer); }
}
