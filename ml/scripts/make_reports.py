"""Renders the JSON reports into standalone HTML (dataset / training / evaluation / failure analysis)."""
import _bootstrap, json, os, html
from dintel.core import REPORTS
CSS = "<style>body{font-family:ui-monospace,Menlo,monospace;background:#0a0a0a;color:#e5e5e5;padding:32px;max-width:1100px;margin:auto}h1,h2{font-weight:500;letter-spacing:.02em}pre{background:#111;border:1px solid #222;padding:16px;overflow:auto;font-size:12px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #222;padding:6px 10px;text-align:left}th{color:#a3a3a3}small{color:#737373}</style>"
def page(title, body, name):
    open(os.path.join(REPORTS, name), "w", encoding="utf-8").write(f"<!doctype html><html><head><meta charset='utf-8'><title>{title}</title>{CSS}</head><body><h1>{title}</h1><small>D-Intel · generated from JSON artefacts · no simulated numbers</small>{body}</body></html>")
def table(rows, cols):
    return "<table><tr>" + "".join(f"<th>{c}</th>" for c in cols) + "</tr>" + "".join("<tr>" + "".join(f"<td>{html.escape(str(r.get(c,'')))}</td>" for c in cols) + "</tr>" for r in rows) + "</table>"
ds = json.load(open(os.path.join(REPORTS, "dataset_report.json"))); tr = json.load(open(os.path.join(REPORTS, "training_report.json")))
me = json.load(open(os.path.join(REPORTS, "metrics.json"))); fa = json.load(open(os.path.join(REPORTS, "failure_analysis.json")))
rows = [{"task": t, "split": s, "n": v["n"], "classes": json.dumps(v["class_distribution"])} for t in ds["tasks"] for s, v in ds["tasks"][t].items() if isinstance(v, dict)]
page("D-Intel Dataset Report", f"<p>{ds['dataset']} — {ds['source']}</p>" + table(rows, ["task", "split", "n", "classes"]) + "<h2>Contamination control</h2><pre>" + html.escape(json.dumps(ds["contamination_control"], indent=1)) + "</pre><h2>Modalities</h2><pre>" + html.escape(json.dumps(ds["modalities"], indent=1)) + "</pre>", "dataset_report.html")
rows = [{"task": t, "candidate": n, "dev_macro_f1": round(m["macro_f1"], 4), "dev_acc": round(m["accuracy"], 4), "selected": "✓" if n == v["selected"] else ""} for t, v in tr["tasks"].items() for n, m in v["dev_candidates"].items()]
page("D-Intel Training Report", f"<p>{tr['model_version']} · trained {tr['trained_at']} · commit {tr['git_commit']}</p><pre>{html.escape(json.dumps(tr['vectorizer'], indent=1))}</pre><h2>Dev-set model selection</h2>" + table(rows, ["task", "candidate", "dev_macro_f1", "dev_acc", "selected"]) + "<h2>Calibration (dev)</h2>" + table([{"task": t, **{k: round(x, 4) if isinstance(x, float) else x for k, x in v["calibration"].items() if k != "reliability_diagram_dev"}} for t, v in tr["tasks"].items()], ["task", "temperature", "dev_ece_uncalibrated", "dev_ece_calibrated", "dev_brier_uncalibrated", "dev_brier_calibrated"]), "training_report.html")
rows = [{"task": t, "model": v["selected_model"], "n": v["n_test"], "acc": round(v["accuracy"], 4), "macro_f1": round(v["macro_f1"], 4), "weighted_f1": round(v["weighted_f1"], 4), "ece": round(v["calibration"]["ece_calibrated"], 4), "brier": round(v["calibration"]["brier_calibrated"], 4), "severe_recall": v.get("severe_recall", ""), "roc_auc": v.get("roc_auc", "")} for t, v in me["tasks"].items()]
cm = "".join(f"<h3>{t}</h3><pre>{html.escape(json.dumps(v['confusion_matrix']))}</pre>" for t, v in me["tasks"].items())
page("D-Intel Evaluation Report (held-out test)", table(rows, ["task", "model", "n", "acc", "macro_f1", "weighted_f1", "ece", "brier", "severe_recall", "roc_auc"]) + "<h2>Experiments</h2><pre>" + html.escape(json.dumps(me["experiments"], indent=1)) + "</pre><h2>Confusion matrices</h2>" + cm, "evaluation_report.html")
body = "".join(f"<h2>{html.escape(k)}</h2><pre>{html.escape(json.dumps(v, indent=1, ensure_ascii=False))}</pre>" for k, v in fa["categories"].items())
page("D-Intel Failure Analysis (real test examples)", body, "failure_analysis.html")
print("reports written")
