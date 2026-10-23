"""
D-Intel Python inference service (FastAPI) — LAYER A ONLY.
Serves the same trained artefact (models/checkpoints/dintel_core_v1.pkl) as the TypeScript service.
The complete product API (Layer A + Layer B fusion, review queue, dashboard) is the Next.js service
(src/app/api/*), which is what Dockerfile / cloudrun.yaml deploy. This FastAPI app is provided for
Python-native consumers and for parity testing.   Run: uvicorn backend.app.main:app --port 8080
"""
import os, sys, time, uuid
from typing import Any, Optional
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ml"))
from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dintel.core import predict_text, MODEL_VERSION, DATASET_VERSION

app = FastAPI(title="D-Intel (Layer A)", version=MODEL_VERSION)
app.add_middleware(CORSMiddleware, allow_origins=[os.getenv("CORS_ORIGIN", "*")], allow_methods=["*"], allow_headers=["*"])
MAX_BYTES = int(os.getenv("MAX_JSON_BYTES", "262144")); API_KEY = os.getenv("DINTEL_API_KEY")
_metrics = {"requests": 0, "errors": 0, "latency_ms_total": 0.0, "low_confidence": 0}

def _auth(key: Optional[str]):
    if API_KEY and key != API_KEY: raise HTTPException(401, {"code": "unauthorized", "message": "missing or invalid X-API-Key"})

@app.middleware("http")
async def limits(request: Request, call_next):
    if int(request.headers.get("content-length") or 0) > MAX_BYTES:
        raise HTTPException(413, {"code": "payload_too_large", "message": f"limit {MAX_BYTES} bytes"})
    t = time.time(); resp = await call_next(request)
    _metrics["requests"] += 1; _metrics["latency_ms_total"] += (time.time() - t) * 1000
    if resp.status_code >= 400: _metrics["errors"] += 1
    return resp

class TextIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)

def _core(text: str, request_id: str):
    out = predict_text(text)
    confs = [v["confidence"] for v in out.values()]
    if sum(confs) / len(confs) < 0.5: _metrics["low_confidence"] += 1
    return {"request_id": request_id, "model_version": MODEL_VERSION, "layer": "A", "predictions": {k: {"label": v["label"], "confidence": round(v["confidence"], 3), "calibration_status": "calibrated_temperature_scaling_dev"} for k, v in out.items()},
            "note": "Layer A only. response_priority / review / evidence fusion are produced by the full service (POST /api/predict/janrakshak on the Next.js deployment)."}

@app.get("/health")
def health(): return {"status": "ok", "model_version": MODEL_VERSION}
@app.get("/model")
def model(): return {"model_version": MODEL_VERSION, "dataset_version": DATASET_VERSION, "layer": "A", "tasks": ["informative", "humanitarian_category", "damage_severity", "disaster_type"]}
@app.get("/capabilities")
def capabilities(): return {"languages": ["en", "en-IN"], "modalities": ["text"], "core_supported_types": ["Flood", "Tropical cyclone", "Earthquake", "Wildfire"]}
@app.get("/metrics")
def metrics(): return {**_metrics, "avg_latency_ms": _metrics["latency_ms_total"] / max(1, _metrics["requests"]), "model_version": MODEL_VERSION}
@app.post("/predict/text")
def predict_text_ep(body: TextIn, x_api_key: Optional[str] = Header(None)):
    _auth(x_api_key); return _core(body.text, str(uuid.uuid4()))
@app.post("/predict")
def predict_generic(body: dict[str, Any], x_api_key: Optional[str] = Header(None)):
    _auth(x_api_key)
    text = body.get("text") or (body.get("payload") or {}).get("rawText")
    if not text: raise HTTPException(422, {"code": "validation_error", "message": "text or payload.rawText required"})
    return _core(text, str(uuid.uuid4()))
@app.post("/predict/janrakshak")
def predict_janrakshak(payload: dict[str, Any], x_api_key: Optional[str] = Header(None)):
    _auth(x_api_key)
    text = next((payload.get(k) for k in ("rawText", "description", "title") if isinstance(payload.get(k), str) and payload.get(k).strip()), None)
    if not text: return {"request_id": str(uuid.uuid4()), "model_version": MODEL_VERSION, "layer": "A", "predictions": None, "review": {"requires_human_review": True, "reasons": ["no usable text"]}}
    r = _core(text, str(uuid.uuid4())); r["input_summary"] = {"text_available": True, "sensor_evidence_available": bool(payload.get("sensorEvidence")), "existing_ai_evidence_available": bool(payload.get("aiDetection")), "identity_fields_ignored": [k for k in ("userId", "reporterId", "userEmail") if k in payload]}
    return r
@app.post("/predict/multimodal")
def predict_multimodal():
    raise HTTPException(501, {"code": "not_implemented", "message": "image encoder not trained in v1; use the Next.js service which validates images and fuses external detector evidence"})
