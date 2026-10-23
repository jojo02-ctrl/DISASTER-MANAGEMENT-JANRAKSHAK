"""
D-Intel core training pipeline (Layer A: General Disaster Intelligence Model).

Dataset: CrisisMMD v2.0 official data splits (text + labels; images NOT downloaded here).
Tasks trained with real supervision:
  - informative            (label_text of informative task)
  - humanitarian_category  (label_text of humanitarian task)
  - damage_severity        (image-level label of damage task, used as a *proxy* label for the paired tweet text)
  - disaster_type          (derived from CrisisMMD event_name metadata -> internal taxonomy)
Not trained (no labels): response_priority  -> derived operational layer (see ts inference).

Everything here is deterministic and re-runnable:  python ml/scripts/train.py
"""
from __future__ import annotations
import csv, json, os, re, hashlib, datetime, subprocess, pickle
from collections import Counter, defaultdict
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW = os.path.join(ROOT, "data", "raw", "crisismmd_datasplit_all")
PROCESSED = os.path.join(ROOT, "data", "processed")
REPORTS = os.path.join(ROOT, "reports")
MODELS = os.path.join(ROOT, "models")
MODEL_VERSION = "dintel-core-v1.0.0"
DATASET_VERSION = "crisismmd-v2.0-datasplit-all"
LABEL_MAPPING_VERSION = "1.0.0"
FEATURE_REGISTRY_VERSION = "1.0.0"

# --- taxonomy: CrisisMMD event -> internal disaster type (configs/label_mapping.yaml mirrors this) ---
EVENT_TO_DISASTER = {
    "hurricane_harvey": "Tropical cyclone",
    "hurricane_irma": "Tropical cyclone",
    "hurricane_maria": "Tropical cyclone",
    "california_wildfires": "Wildfire",
    "mexico_earthquake": "Earthquake",
    "iraq_iran_earthquake": "Earthquake",
    "srilanka_floods": "Flood",
}
# tokens that trivially identify the event (memorisation shortcut) -> masked during TRAINING only
EVENT_NAME_TOKENS = {
    "harvey", "irma", "maria", "hurricaneharvey", "hurricaneirma", "hurricanemaria", "houston", "texas",
    "florida", "puerto", "rico", "puertorico", "prstrong", "napa", "sonoma", "california", "santarosa",
    "mexico", "mexicocity", "cdmx", "oaxaca", "chiapas", "iraq", "iran", "kermanshah", "halabja",
    "srilanka", "sri", "lanka", "colombo", "kalutara",
}
HUMANITARIAN_LABELS = {
    "affected_individuals": "Affected individuals",
    "infrastructure_and_utility_damage": "Infrastructure and utility damage",
    "injured_or_dead_people": "Injured or dead people",
    "missing_or_found_people": "Missing or found people",
    "rescue_volunteering_or_donation_effort": "Rescue, volunteering or donation effort",
    "vehicle_damage": "Vehicle damage",
    "other_relevant_information": "Other relevant information",
    "not_humanitarian": "Not humanitarian",
}
SEVERITY_LABELS = {"severe_damage": "Severe", "mild_damage": "Mild", "little_or_no_damage": "Little or none"}
INFORMATIVE_LABELS = {"informative": "informative", "not_informative": "not_informative"}
SEVERITY_ORDER = ["Little or none", "Mild", "Severe"]

URL_RE = re.compile(r"https?://\S+|www\.\S+")
MENTION_RE = re.compile(r"@\w+")
TOKEN_RE = re.compile(r"\b\w\w+\b", re.UNICODE)


def fix_mojibake(s: str) -> str:
    # dataset tweets are frequently double-encoded ("Weâ€™re"); attempt safe reversal
    try:
        return s.encode("cp1252").decode("utf-8")
    except Exception:
        try:
            return s.encode("latin-1").decode("utf-8")
        except Exception:
            return s


def normalize_text(s: str) -> str:
    """MUST stay in sync with src/lib/dintel/text.ts (TypeScript inference)."""
    if not s:
        return ""
    s = s.replace("\u2019", "'").replace("\u2018", "'").replace("\u201c", '"').replace("\u201d", '"')
    s = s.lower()
    s = re.sub(r"^rt\s+", "", s)
    s = URL_RE.sub(" url ", s)
    s = MENTION_RE.sub(" user ", s)
    s = s.replace("#", " ").replace("&amp;", " and ")
    s = re.sub(r"[^\w\s']", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def mask_event_tokens(s: str) -> str:
    return " ".join("eventname" if t in EVENT_NAME_TOKENS else t for t in s.split())


def tokenize(s: str):
    return TOKEN_RE.findall(s)


def read_tsv(path):
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE))


def git_commit():
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        return "unavailable"


# ---------------------------------------------------------------- dataset preparation
def build_dataset():
    """Loads official splits, dedupes to tweet level, removes cross-split text contamination,
    maps labels to the internal taxonomy and writes data/processed/*.jsonl + reports/dataset_report.json"""
    os.makedirs(PROCESSED, exist_ok=True)
    os.makedirs(REPORTS, exist_ok=True)
    report = {"dataset": DATASET_VERSION, "source": "https://crisisnlp.qcri.org/crisismmd", "tasks": {},
              "images_downloaded": False, "raw_rows": {}, "generated_at": datetime.datetime.utcnow().isoformat() + "Z"}
    tasks = {}
    for task in ["informative", "humanitarian", "damage"]:
        tasks[task] = {}
        for split in ["train", "dev", "test"]:
            rows = read_tsv(os.path.join(RAW, f"task_{task}_text_img_{split}.tsv"))
            report["raw_rows"][f"{task}/{split}"] = len(rows)
            per_tweet = defaultdict(list)
            for r in rows:
                lab = r.get("label_text") or r["label"]
                per_tweet[r["tweet_id"]].append((r, lab))
            recs, conflicting = [], 0
            for tid, items in per_tweet.items():
                labs = {l for _, l in items}
                if len(labs) > 1:  # image-level labels disagree across images of the same tweet -> drop (damage task)
                    conflicting += 1
                    continue
                r, lab = items[0]
                text = fix_mojibake(r["tweet_text"])
                recs.append({"tweet_id": tid, "event": r["event_name"], "text": text,
                             "norm": normalize_text(text), "label": lab, "n_images": len(items),
                             "image_label": items[0][0].get("label_image")})
            tasks[task][split] = {"records": recs, "conflicting_dropped": conflicting}

    # --- cross-split contamination: identical normalised text in train and dev/test -> remove from TRAIN
    contamination = {}
    for task in tasks:
        held = {r["norm"] for s in ["dev", "test"] for r in tasks[task][s]["records"]}
        train = tasks[task]["train"]["records"]
        before = len(train)
        seen, kept = set(), []
        exact_dups = 0
        for r in train:
            if r["norm"] in held:
                continue
            if r["norm"] in seen:
                exact_dups += 1
                continue
            seen.add(r["norm"])
            kept.append(r)
        tasks[task]["train"]["records"] = kept
        contamination[task] = {"train_before": before, "removed_overlap_with_dev_test": before - exact_dups - len(kept),
                               "removed_exact_duplicates_in_train": exact_dups, "train_after": len(kept)}
    report["contamination_control"] = contamination

    # --- label mapping + disaster_type task (from informative split tweets, event metadata as label)
    out = {}
    for split in ["train", "dev", "test"]:
        out[split] = []
        for r in tasks["informative"][split]["records"]:
            out[split].append({"id": r["tweet_id"], "text": r["text"], "norm": r["norm"], "event": r["event"],
                               "task": "informative", "label": INFORMATIVE_LABELS[r["label"]]})
            out[split].append({"id": r["tweet_id"], "text": r["text"], "norm": r["norm"], "event": r["event"],
                               "task": "disaster_type", "label": EVENT_TO_DISASTER[r["event"]]})
        for r in tasks["humanitarian"][split]["records"]:
            out[split].append({"id": r["tweet_id"], "text": r["text"], "norm": r["norm"], "event": r["event"],
                               "task": "humanitarian_category", "label": HUMANITARIAN_LABELS[r["label"]]})
        for r in tasks["damage"][split]["records"]:
            out[split].append({"id": r["tweet_id"], "text": r["text"], "norm": r["norm"], "event": r["event"],
                               "task": "damage_severity", "label": SEVERITY_LABELS[r["label"]],
                               "label_provenance": "image_annotation_paired_to_text"})
        with open(os.path.join(PROCESSED, f"{split}.jsonl"), "w", encoding="utf-8") as f:
            for rec in out[split]:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    for task in ["informative", "disaster_type", "humanitarian_category", "damage_severity"]:
        report["tasks"][task] = {}
        for split in ["train", "dev", "test"]:
            recs = [r for r in out[split] if r["task"] == task]
            report["tasks"][task][split] = {"n": len(recs), "class_distribution": dict(Counter(r["label"] for r in recs))}
        report["tasks"][task]["label_source"] = {
            "informative": "CrisisMMD text annotation (label_text)",
            "humanitarian_category": "CrisisMMD text annotation (label_text)",
            "damage_severity": "CrisisMMD IMAGE annotation used as proxy label for the paired tweet text (no text-level severity labels exist)",
            "disaster_type": "CrisisMMD event_name metadata mapped to internal taxonomy (4 of 13 taxonomy classes covered)",
        }[task]
    report["conflicting_multi_image_tweets_dropped"] = {t: {s: tasks[t][s]["conflicting_dropped"] for s in tasks[t]} for t in tasks}
    report["modalities"] = {"text": "available", "image": "labels available, image files NOT downloaded in this build (2.1GB) -> image/multimodal experiments not conducted",
                            "structured_janrakshak_fields": "NOT present in CrisisMMD (urgency, sensorEvidence, aiDetection, GPS) -> handled only in Layer B fusion"}
    with open(os.path.join(REPORTS, "dataset_report.json"), "w") as f:
        json.dump(report, f, indent=2)
    return out, report


def load_processed():
    out = {}
    for split in ["train", "dev", "test"]:
        with open(os.path.join(PROCESSED, f"{split}.jsonl"), encoding="utf-8") as f:
            out[split] = [json.loads(l) for l in f]
    return out


# ---------------------------------------------------------------- metrics
def softmax(z, T=1.0):
    z = np.asarray(z, dtype=np.float64) / T
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def ece_score(probs, y_idx, n_bins=15):
    conf = probs.max(1); pred = probs.argmax(1); acc = (pred == y_idx).astype(float)
    bins = np.linspace(0, 1, n_bins + 1); ece = 0.0; diagram = []
    for i in range(n_bins):
        m = (conf > bins[i]) & (conf <= bins[i + 1])
        if m.sum() == 0:
            continue
        ece += m.mean() * abs(acc[m].mean() - conf[m].mean())
        diagram.append({"bin_lower": float(bins[i]), "bin_upper": float(bins[i + 1]), "count": int(m.sum()),
                        "avg_confidence": float(conf[m].mean()), "accuracy": float(acc[m].mean())})
    return float(ece), diagram


def brier_score(probs, y_idx):
    onehot = np.zeros_like(probs); onehot[np.arange(len(y_idx)), y_idx] = 1
    return float(((probs - onehot) ** 2).sum(1).mean())


def classification_metrics(y_true, y_pred, classes, probs=None):
    from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix, roc_auc_score, average_precision_score
    p, r, f, _ = precision_recall_fscore_support(y_true, y_pred, labels=classes, average="macro", zero_division=0)
    pw, rw, fw, _ = precision_recall_fscore_support(y_true, y_pred, labels=classes, average="weighted", zero_division=0)
    pc, rc, fc, sc = precision_recall_fscore_support(y_true, y_pred, labels=classes, average=None, zero_division=0)
    m = {"accuracy": float(accuracy_score(y_true, y_pred)), "macro_precision": float(p), "macro_recall": float(r),
         "macro_f1": float(f), "weighted_precision": float(pw), "weighted_recall": float(rw), "weighted_f1": float(fw),
         "per_class": {c: {"precision": float(pc[i]), "recall": float(rc[i]), "f1": float(fc[i]), "support": int(sc[i])} for i, c in enumerate(classes)},
         "confusion_matrix": {"labels": classes, "matrix": confusion_matrix(y_true, y_pred, labels=classes).tolist()}}
    if probs is not None and len(classes) == 2:
        pos = classes.index("informative") if "informative" in classes else 1
        yb = np.array([1 if y == classes[pos] else 0 for y in y_true])
        m["roc_auc"] = float(roc_auc_score(yb, probs[:, pos])); m["pr_auc"] = float(average_precision_score(yb, probs[:, pos]))
    if "Severe" in classes:
        yt = np.array(y_true); yp = np.array(y_pred)
        sev = yt == "Severe"
        m["severe_recall"] = float((yp[sev] == "Severe").mean()) if sev.any() else None
        m["severe_precision"] = float((yt[yp == "Severe"] == "Severe").mean()) if (yp == "Severe").any() else None
        m["severe_f1"] = m["per_class"]["Severe"]["f1"]
        m["severe_underprediction_rate"] = float((yp[sev] != "Severe").mean()) if sev.any() else None
    return m


def fit_temperature(logits, y_idx):
    """Temperature scaling on the validation (dev) set: minimise NLL over T via 1-D grid + refinement."""
    best_T, best_nll = 1.0, 1e9
    for T in np.concatenate([np.linspace(0.3, 5.0, 95), np.linspace(0.05, 0.3, 10)]):
        p = softmax(logits, T); nll = -np.log(p[np.arange(len(y_idx)), y_idx] + 1e-12).mean()
        if nll < best_nll:
            best_T, best_nll = float(T), float(nll)
    for T in np.linspace(max(0.05, best_T - 0.1), best_T + 0.1, 41):
        p = softmax(logits, T); nll = -np.log(p[np.arange(len(y_idx)), y_idx] + 1e-12).mean()
        if nll < best_nll:
            best_T, best_nll = float(T), float(nll)
    return best_T


# ---------------------------------------------------------------- training
def decision_matrix(clf, X, n_classes):
    d = clf.decision_function(X)
    if n_classes == 2:  # sklearn binary: single score for classes_[1]; represent as 2-column logits [0, z]
        d = np.stack([np.zeros_like(d), d], axis=1)
    return d


def train_all(config: dict):
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.svm import LinearSVC
    os.makedirs(os.path.join(MODELS, "checkpoints"), exist_ok=True)
    data = load_processed()
    tasks = ["informative", "humanitarian_category", "damage_severity", "disaster_type"]

    # shared vectoriser fitted on the union of training texts (event names masked -> reduces memorisation shortcut)
    train_texts = sorted({mask_event_tokens(r["norm"]) for r in data["train"]})
    vec = TfidfVectorizer(ngram_range=(1, 2), min_df=config.get("min_df", 2), max_features=config.get("max_features", 40000),
                          sublinear_tf=True, token_pattern=r"(?u)\b\w\w+\b", lowercase=False, dtype=np.float32)
    vec.fit(train_texts)

    candidates = {
        "tfidf_logreg": lambda: LogisticRegression(C=config.get("C", 4.0), max_iter=3000, class_weight=None),
        "tfidf_logreg_balanced": lambda: LogisticRegression(C=config.get("C", 4.0), max_iter=3000, class_weight="balanced"),
        "tfidf_linearsvm": lambda: LinearSVC(C=0.5, class_weight=None),
        "tfidf_linearsvm_balanced": lambda: LinearSVC(C=0.5, class_weight="balanced"),
    }
    training_report = {"model_version": MODEL_VERSION, "dataset_version": DATASET_VERSION, "trained_at": datetime.datetime.utcnow().isoformat() + "Z",
                       "git_commit": git_commit(), "vectorizer": {"ngram_range": [1, 2], "min_df": config.get("min_df", 2),
                       "max_features": config.get("max_features", 40000), "sublinear_tf": True, "vocab_size": len(vec.vocabulary_),
                       "event_name_masking": True}, "candidates": list(candidates), "selection_rule": "highest dev macro-F1 (test untouched)", "tasks": {}}
    selected = {}
    for task in tasks:
        tr = [r for r in data["train"] if r["task"] == task]; dv = [r for r in data["dev"] if r["task"] == task]
        classes = sorted({r["label"] for r in tr})
        if task == "damage_severity":
            classes = SEVERITY_ORDER
        Xtr = vec.transform([mask_event_tokens(r["norm"]) for r in tr]); ytr = [r["label"] for r in tr]
        Xdv = vec.transform([r["norm"] for r in dv]); ydv = [r["label"] for r in dv]
        results, best = {}, None
        for name, make in candidates.items():
            clf = make(); clf.fit(Xtr, ytr)
            cls = list(clf.classes_)
            logits = decision_matrix(clf, Xdv, len(cls))
            pred = [cls[i] for i in logits.argmax(1)]
            m = classification_metrics(ydv, pred, cls, softmax(logits))
            results[name] = {k: v for k, v in m.items() if k not in ("per_class", "confusion_matrix")}
            if best is None or m["macro_f1"] > best[1]["macro_f1"]:
                best = (name, m, clf, logits)
        name, m, clf, logits = best
        cls = list(clf.classes_)
        yidx = np.array([cls.index(y) for y in ydv])
        T = fit_temperature(logits, yidx)
        ece_raw, _ = ece_score(softmax(logits), yidx); ece_cal, diag = ece_score(softmax(logits, T), yidx)
        selected[task] = {"model": clf, "name": name, "classes": cls, "temperature": T}
        training_report["tasks"][task] = {"n_train": len(tr), "n_dev": len(dv), "classes": cls,
                                          "train_distribution": dict(Counter(ytr)), "dev_candidates": results, "selected": name,
                                          "dev_metrics_selected": m, "calibration": {"method": "temperature_scaling", "fit_on": "dev",
                                          "temperature": T, "dev_ece_uncalibrated": ece_raw, "dev_ece_calibrated": ece_cal,
                                          "dev_brier_uncalibrated": brier_score(softmax(logits), yidx), "dev_brier_calibrated": brier_score(softmax(logits, T), yidx),
                                          "reliability_diagram_dev": diag}}
    with open(os.path.join(MODELS, "checkpoints", "dintel_core_v1.pkl"), "wb") as f:
        pickle.dump({"vectorizer": vec, "tasks": selected, "model_version": MODEL_VERSION}, f)
    with open(os.path.join(REPORTS, "training_report.json"), "w") as f:
        json.dump(training_report, f, indent=2)
    return training_report


def load_checkpoint():
    with open(os.path.join(MODELS, "checkpoints", "dintel_core_v1.pkl"), "rb") as f:
        return pickle.load(f)


def evaluate_test():
    """Evaluated ONCE after model selection on dev. Writes reports/metrics.json + failure_analysis.json"""
    ck = load_checkpoint(); vec = ck["vectorizer"]; data = load_processed()
    tr_report = json.load(open(os.path.join(REPORTS, "training_report.json")))
    metrics = {"model_version": MODEL_VERSION, "dataset_version": DATASET_VERSION, "evaluated_at": datetime.datetime.utcnow().isoformat() + "Z",
               "split": "test (official CrisisMMD v2 test split, untouched during selection)", "tasks": {}, "experiments": {}}
    failures = {"model_version": MODEL_VERSION, "categories": {}}
    for task, info in ck["tasks"].items():
        te = [r for r in data["test"] if r["task"] == task]
        X = vec.transform([r["norm"] for r in te]); y = [r["label"] for r in te]
        cls = info["classes"]; logits = decision_matrix(info["model"], X, len(cls))
        P_raw, P_cal = softmax(logits), softmax(logits, info["temperature"])
        pred = [cls[i] for i in P_cal.argmax(1)]
        yidx = np.array([cls.index(v) for v in y])
        m = classification_metrics(y, pred, cls, P_cal)
        m["calibration"] = {"temperature": info["temperature"], "ece_uncalibrated": ece_score(P_raw, yidx)[0], "ece_calibrated": ece_score(P_cal, yidx)[0],
                            "brier_uncalibrated": brier_score(P_raw, yidx), "brier_calibrated": brier_score(P_cal, yidx),
                            "reliability_diagram": ece_score(P_cal, yidx)[1]}
        m["selected_model"] = info["name"]; m["n_test"] = len(te)
        m["confidence_histogram"] = np.histogram(P_cal.max(1), bins=10, range=(0, 1))[0].tolist()
        metrics["tasks"][task] = m
        # ---- failure analysis (real test examples)
        conf = P_cal.max(1)
        rows = [{"id": te[i]["id"], "text": te[i]["text"], "true": y[i], "pred": pred[i], "confidence": float(conf[i]), "event": te[i]["event"]} for i in range(len(te))]
        wrong = [r for r in rows if r["true"] != r["pred"]]
        failures["categories"][f"{task}/high_confidence_wrong"] = sorted(wrong, key=lambda r: -r["confidence"])[:8]
        failures["categories"][f"{task}/low_confidence"] = sorted(rows, key=lambda r: r["confidence"])[:8]
        if task == "damage_severity":
            failures["categories"]["damage_severity/severe_underprediction"] = [r for r in wrong if r["true"] == "Severe"][:10]
        if task == "disaster_type":
            failures["categories"]["disaster_type/unsupported_categories"] = {
                "note": "Landslide, Drought, Pollution, Chemical hazard, Extreme temperature, Emergency/SOS, Infrastructure, Storm, Other are NOT in CrisisMMD; the core model cannot predict them. The adapter routes such citizen-declared types to human review.",
                "supported": cls}
        failures["categories"][f"{task}/error_rate_by_event"] = {e: {"n": n, "error_rate": float(sum(1 for r in rows if r["event"] == e and r["true"] != r["pred"]) / n)}
                                                                  for e, n in Counter(r["event"] for r in rows).items()}
    # text/image disagreement examples are taken from the dataset's own label_text_image field (informative task test split)
    dis = [r for r in read_tsv(os.path.join(RAW, "task_informative_text_img_test.tsv")) if r["label_text_image"] == "Negative"][:8]
    failures["categories"]["text_image_disagreement_in_dataset"] = [{"id": r["tweet_id"], "text": fix_mojibake(r["tweet_text"]), "label_text": r["label_text"], "label_image": r["label_image"]} for r in dis]
    total = len(read_tsv(os.path.join(RAW, "task_informative_text_img_test.tsv")))
    failures["categories"]["text_image_disagreement_rate_test"] = {"disagreeing_pairs": len([1 for r in read_tsv(os.path.join(RAW, "task_informative_text_img_test.tsv")) if r["label_text_image"] == "Negative"]), "total_pairs": total}
    metrics["experiments"] = {
        "A_text_only": {"status": "conducted", "models": ["tfidf_logreg", "tfidf_logreg_balanced", "tfidf_linearsvm", "tfidf_linearsvm_balanced"], "note": "selected per task on dev macro-F1"},
        "B_image_only": {"status": "not_conducted", "reason": "CrisisMMD image files (2.1GB) were not downloaded in this build; no GPU available. Code path documented in ml/scripts/train_image.md"},
        "C_text_plus_image": {"status": "not_conducted", "reason": "requires image files"},
        "D_text_plus_structured": {"status": "not_conducted", "reason": "CrisisMMD contains no structured JanRakshak-style metadata; fabricating it is prohibited"},
        "E_text_image_structured": {"status": "not_conducted", "reason": "requires image files and JanRakshak-labelled data"},
        "transformer_text": {"status": "not_conducted", "reason": "no GPU / torch not installed in build sandbox; training script provided (ml/scripts/train_transformer.py) but not executed; NO metrics claimed"},
        "janrakshak_ablation": {"status": "not_conducted", "reason": "no JanRakshak-labelled evaluation dataset exists yet (see verified_janrakshak_dataset)"},
    }
    metrics["response_priority"] = {"status": "derived_not_learned", "note": "no ground-truth priority labels exist; priority is a documented rule layer over calibrated outputs (see src/lib/dintel/fusion.ts). No priority accuracy is claimed."}
    metrics["dev_selection"] = {t: tr_report["tasks"][t]["dev_candidates"] for t in tr_report["tasks"]}
    json.dump(metrics, open(os.path.join(REPORTS, "metrics.json"), "w"), indent=2)
    json.dump(failures, open(os.path.join(REPORTS, "failure_analysis.json"), "w"), indent=2, ensure_ascii=False)
    return metrics, failures


def export_json():
    """Exports the selected linear models to a compact JSON the TypeScript inference engine can load."""
    ck = load_checkpoint(); vec = ck["vectorizer"]
    os.makedirs(os.path.join(MODELS, "exported"), exist_ok=True); os.makedirs(os.path.join(MODELS, "metadata"), exist_ok=True)
    vocab = sorted(vec.vocabulary_.items(), key=lambda kv: kv[1])
    tasks = {}
    for task, info in ck["tasks"].items():
        clf = info["model"]; W = clf.coef_; b = clf.intercept_
        if W.shape[0] == 1:  # binary -> 2-row logits [0, z]
            W = np.vstack([np.zeros_like(W), W]); b = np.array([0.0, float(b[0])])
        tasks[task] = {"classes": info["classes"], "model_type": info["name"], "temperature": info["temperature"],
                       "calibration_status": "calibrated_temperature_scaling_dev", "weights": np.round(W, 5).tolist(), "bias": np.round(b, 5).tolist()}
    tr = json.load(open(os.path.join(REPORTS, "training_report.json")))
    export = {"model_version": MODEL_VERSION, "dataset_version": DATASET_VERSION, "training_timestamp": tr["trained_at"], "git_commit": tr["git_commit"],
              "architecture": "shared TF-IDF(1-2gram, sublinear) -> per-task linear heads (LogReg / LinearSVM selected on dev) -> temperature scaling",
              "hyperparameters": tr["vectorizer"], "label_mapping_version": LABEL_MAPPING_VERSION, "feature_registry_version": FEATURE_REGISTRY_VERSION,
              "calibration_version": "temp-scaling-v1", "text_normalizer": "dintel-norm-v1", "vocab": [t for t, _ in vocab], "idf": np.round(vec.idf_, 5).tolist(), "tasks": tasks}
    path = os.path.join(MODELS, "exported", "dintel_core_v1.json")
    json.dump(export, open(path, "w"))
    meta = {k: v for k, v in export.items() if k not in ("vocab", "idf", "tasks")}
    meta["tasks"] = {t: {k: v for k, v in tasks[t].items() if k not in ("weights", "bias")} for t in tasks}
    meta["sha256"] = hashlib.sha256(open(path, "rb").read()).hexdigest(); meta["size_bytes"] = os.path.getsize(path)
    json.dump(meta, open(os.path.join(MODELS, "metadata", "dintel_core_v1.json"), "w"), indent=2)
    return meta


def predict_text(text: str):
    ck = load_checkpoint(); vec = ck["vectorizer"]
    X = vec.transform([normalize_text(text)]); out = {}
    for task, info in ck["tasks"].items():
        logits = decision_matrix(info["model"], X, len(info["classes"])); p = softmax(logits, info["temperature"])[0]
        out[task] = {"label": info["classes"][int(p.argmax())], "confidence": float(p.max()), "probs": {c: float(p[i]) for i, c in enumerate(info["classes"])}}
    return out
