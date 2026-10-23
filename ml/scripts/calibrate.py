"""Re-fits temperature scaling on the dev split for each task head and reports ECE/Brier before/after (dev)."""
import _bootstrap, json, os, pickle, numpy as np
from dintel.core import load_checkpoint, load_processed, decision_matrix, softmax, fit_temperature, ece_score, brier_score, MODELS, REPORTS
ck = load_checkpoint(); d = load_processed(); out = {}
for task, info in ck["tasks"].items():
    dv = [r for r in d["dev"] if r["task"] == task]; X = ck["vectorizer"].transform([r["norm"] for r in dv])
    y = np.array([info["classes"].index(r["label"]) for r in dv]); L = decision_matrix(info["model"], X, len(info["classes"]))
    T = fit_temperature(L, y); info["temperature"] = T
    out[task] = {"temperature": T, "ece_before": ece_score(softmax(L), y)[0], "ece_after": ece_score(softmax(L, T), y)[0],
                 "brier_before": brier_score(softmax(L), y), "brier_after": brier_score(softmax(L, T), y), "reliability": ece_score(softmax(L, T), y)[1]}
    print(f"{task:24s} T={T:.3f} ECE {out[task]['ece_before']:.4f} -> {out[task]['ece_after']:.4f}  Brier {out[task]['brier_before']:.4f} -> {out[task]['brier_after']:.4f}")
pickle.dump(ck, open(os.path.join(MODELS, "checkpoints", "dintel_core_v1.pkl"), "wb"))
json.dump(out, open(os.path.join(REPORTS, "calibration_report.json"), "w"), indent=2)
