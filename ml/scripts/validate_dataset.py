"""Checks file integrity, label vocabularies, and cross-split leakage of the processed dataset."""
import _bootstrap, json, sys, collections
from dintel.core import load_processed, HUMANITARIAN_LABELS, SEVERITY_LABELS, EVENT_TO_DISASTER
d = load_processed(); ok = True
allowed = {"informative": {"informative", "not_informative"}, "humanitarian_category": set(HUMANITARIAN_LABELS.values()),
           "damage_severity": set(SEVERITY_LABELS.values()), "disaster_type": set(EVENT_TO_DISASTER.values())}
for s in d:
    for r in d[s]:
        if r["label"] not in allowed[r["task"]] or not r["norm"]: ok = False; print("BAD", s, r["id"], r["task"], r["label"])
for task in allowed:
    tr = {r["norm"] for r in d["train"] if r["task"] == task}; te = {r["norm"] for r in d["test"] if r["task"] == task}; dv = {r["norm"] for r in d["dev"] if r["task"] == task}
    print(task, "train/test text overlap:", len(tr & te), "train/dev:", len(tr & dv), "dev/test:", len(dv & te))
    if tr & te or tr & dv: ok = False
print("VALID" if ok else "INVALID"); sys.exit(0 if ok else 1)
