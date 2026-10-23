"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/ui";
import ResultView from "@/components/ResultView";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Tab = "TEXT" | "IMAGE" | "JANRAKSHAK PAYLOAD";
const SCENARIOS = [
  "This road is flooded and cars are stranded.",
  "Large cracks appeared after strong shaking, earthquake felt across the city.",
  "Smoke and flames are visible near the forest, wildfire spreading towards houses.",
  "Chemical smell and people having difficulty breathing.",
  "Volunteers needed at the relief camp, donations of blankets welcome.",
];

export default function AnalyzePage() {
  const [tab, setTab] = useState<Tab>("JANRAKSHAK PAYLOAD");
  const [text, setText] = useState(SCENARIOS[0]);
  const [type, setType] = useState("");
  const [json, setJson] = useState("");
  const [fixtures, setFixtures] = useState<{ name: string; payload: unknown }[]>([]);
  const [validation, setValidation] = useState<string | null>(null);
  const [imgText, setImgText] = useState("Flood water is rising fast in our street");
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch("/api/fixtures").then((r) => r.json()).then((j) => { setFixtures(j.fixtures); const f = j.fixtures.find((x: any) => x.name === "flood"); if (f) setJson(JSON.stringify(f.payload, null, 2)); }); }, []);

  const validate = () => {
    try { const p = JSON.parse(json); if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error("payload must be a JSON object");
      const hasText = ["rawText", "description", "title"].some((k) => typeof p[k] === "string" && p[k].trim());
      setValidation(`valid JSON · ${Object.keys(p).length} fields · text ${hasText ? "present" : "ABSENT (core model will be skipped)"} · sensorEvidence ${p.sensorEvidence ? "present" : "absent"} · aiDetection ${p.aiDetection ? "present" : "absent"} · location ${p.lat != null && p.lng != null ? "present" : "absent"}`); return true;
    } catch (e) { setValidation(`invalid: ${(e as Error).message}`); return false; }
  };

  const run = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      let res: Response;
      if (tab === "TEXT") res = await fetch("/api/predict/text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, type: type || undefined }) });
      else if (tab === "IMAGE") { const fd = new FormData(); fd.append("text", imgText); if (file) fd.append("image", file); if (imageUrl) fd.append("image_url", imageUrl); res = await fetch("/api/predict/multimodal", { method: "POST", body: fd }); }
      else { if (!validate()) { setBusy(false); return; } res = await fetch("/api/predict/janrakshak", { method: "POST", headers: { "Content-Type": "application/json" }, body: json }); }
      const j = await res.json();
      if (!res.ok) throw new Error(`${j.error?.code}: ${j.error?.message}`);
      setResult(j);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const tabs: Tab[] = ["TEXT", "IMAGE", "JANRAKSHAK PAYLOAD"];
  return (
    <div>
      <PageHeader code="01 / ANALYZE" title="Analyze incident" sub="Every number below is produced by the deployed model and the documented fusion rules — nothing is pre-computed for the examples." />
      <div className="p-8 space-y-6">
        <div className="panel">
          <div className="flex border-b border-[var(--line)]">{tabs.map((t) => (<button key={t} onClick={() => { setTab(t); setResult(null); }} className={`mono text-[11px] tracking-[0.2em] px-5 py-3 border-b-2 transition-colors ${tab === t ? "border-[var(--accent)] text-white" : "border-transparent text-[var(--muted)] hover:text-white"}`}>{t}</button>))}</div>
          <div className="p-5">
            {tab === "TEXT" && (
              <div className="grid lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-3">
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="w-full bg-black/40 border border-[var(--line)] rounded p-3 text-sm focus:border-white/30" placeholder="Citizen report text…" />
                  <div className="flex gap-3 items-center"><input value={type} onChange={(e) => setType(e.target.value)} placeholder="optional citizen-declared type (e.g. Flood)" className="bg-black/40 border border-[var(--line)] rounded px-3 py-2 text-xs w-80" /><span className="text-[10px] text-[var(--muted)]">type is used for agreement checks, never as a model input</span></div>
                </div>
                <div><p className="label mb-2">Scenarios</p><div className="space-y-1">{SCENARIOS.map((s) => <button key={s} onClick={() => setText(s)} className="block text-left text-[12px] text-white/70 hover:text-white w-full border border-[var(--line)] rounded px-3 py-2">{s}</button>)}</div></div>
              </div>)}
            {tab === "IMAGE" && (
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <textarea value={imgText} onChange={(e) => setImgText(e.target.value)} rows={3} className="w-full bg-black/40 border border-[var(--line)] rounded p-3 text-sm" placeholder="Optional accompanying text" />
                  <div className="flex gap-3 items-center"><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs" /><span className="text-[10px] text-[var(--muted)]">or</span><input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="image URL / gs:// reference" className="bg-black/40 border border-[var(--line)] rounded px-3 py-2 text-xs flex-1" /></div>
                </div>
                <div className="panel p-4 border-[rgba(251,191,36,.3)]"><p className="label">Honest capability note</p><p className="text-[12px] text-white/75 mt-1">D-Intel v1 validates and accepts images (MIME, size, signature) but has <span className="text-[var(--warn)]">no trained image encoder</span>: the CrisisMMD image files were not downloaded in this build. Image analysis is reported as unavailable; only external detector evidence (JanRakshak aiDetection) is fused. Nothing is invented from the pixels.</p></div>
              </div>)}
            {tab === "JANRAKSHAK PAYLOAD" && (
              <div className="grid lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-2">
                  <textarea value={json} onChange={(e) => { setJson(e.target.value); setValidation(null); }} rows={16} spellCheck={false} className="w-full bg-black/40 border border-[var(--line)] rounded p-3 mono text-[11px] leading-relaxed focus:border-white/30" placeholder="Paste a JanRakshak Firebase incident payload…" />
                  <div className="flex items-center gap-3 flex-wrap">
                    <button onClick={validate} className="mono text-[10px] tracking-widest border border-[var(--line)] px-3 py-1.5 rounded hover:border-white/40">VALIDATE PAYLOAD</button>
                    <label className="mono text-[10px] tracking-widest border border-[var(--line)] px-3 py-1.5 rounded hover:border-white/40 cursor-pointer">UPLOAD JSON<input type="file" accept="application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setJson(await f.text()); }} /></label>
                    {validation && <span className={`mono text-[10px] ${validation.startsWith("invalid") ? "text-[var(--accent)]" : "text-[var(--ok)]"}`}>{validation}</span>}
                  </div>
                </div>
                <div><p className="label mb-2">Prepared examples (tests/fixtures/janrakshak)</p><div className="grid grid-cols-2 gap-1">{fixtures.map((f) => <button key={f.name} onClick={() => { setJson(JSON.stringify(f.payload, null, 2)); setValidation(null); }} className="text-left mono text-[11px] text-white/70 hover:text-white border border-[var(--line)] rounded px-2 py-1.5 truncate">{f.name}</button>)}</div></div>
              </div>)}
            <div className="mt-4 flex items-center gap-4">
              <button onClick={run} disabled={busy} className="mono text-xs tracking-[0.25em] bg-[var(--accent)] text-black px-6 py-3 rounded font-semibold disabled:opacity-50 hover:brightness-110">{busy ? "ANALYZING…" : "ANALYZE INCIDENT"}</button>
              {error && <span className="mono text-xs text-[var(--accent)]">{error}</span>}
            </div>
          </div>
        </div>
        <AnimatePresence>{result && (<motion.div key={result.request_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><ResultView r={result} /></motion.div>)}</AnimatePresence>
      </div>
    </div>
  );
}
