"""
DistilBERT multi-task text classifier for D-Intel (Layer A, advanced baseline).
STATUS: PROVIDED BUT NOT EXECUTED in this build (no GPU / torch not installed). No metrics are claimed for it.
Usage (GPU machine):  pip install torch transformers && python ml/scripts/train_transformer.py --epochs 3
Uses the same processed splits (data/processed/*.jsonl) and the same label mapping as the deployed model,
so results are directly comparable in reports/metrics.json under experiments.transformer_text.
"""
import _bootstrap, argparse, json, os
from dintel.core import load_processed, REPORTS, MODELS
ap = argparse.ArgumentParser(); ap.add_argument("--model", default="distilbert-base-uncased"); ap.add_argument("--epochs", type=int, default=3); ap.add_argument("--lr", type=float, default=3e-5); ap.add_argument("--max_len", type=int, default=128); a = ap.parse_args()
try:
    import torch, torch.nn as nn
    from transformers import AutoTokenizer, AutoModel
except ImportError:
    raise SystemExit("torch/transformers not installed — this script was intentionally not run in the build sandbox")
TASKS = ["informative", "humanitarian_category", "damage_severity", "disaster_type"]
data = load_processed(); tok = AutoTokenizer.from_pretrained(a.model)
labels = {t: sorted({r["label"] for r in data["train"] if r["task"] == t}) for t in TASKS}
class MT(nn.Module):
    def __init__(s):
        super().__init__(); s.enc = AutoModel.from_pretrained(a.model); h = s.enc.config.hidden_size
        s.heads = nn.ModuleDict({t: nn.Linear(h, len(labels[t])) for t in TASKS})
    def forward(s, **x):
        z = s.enc(**x).last_hidden_state[:, 0]; return {t: s.heads[t](z) for t in TASKS}
dev = "cuda" if torch.cuda.is_available() else "cpu"; m = MT().to(dev); opt = torch.optim.AdamW(m.parameters(), lr=a.lr)
def batches(split, bs=32):
    rows = data[split]
    for i in range(0, len(rows), bs):
        b = rows[i:i + bs]; x = tok([r["norm"] for r in b], truncation=True, max_length=a.max_len, padding=True, return_tensors="pt").to(dev)
        yield b, x
for ep in range(a.epochs):
    m.train()
    for b, x in batches("train"):
        out = m(**x); loss = 0
        for t in TASKS:  # each record carries exactly one task label -> masked multi-task loss (no fabricated labels)
            idx = [i for i, r in enumerate(b) if r["task"] == t]
            if idx: loss = loss + nn.functional.cross_entropy(out[t][idx], torch.tensor([labels[t].index(b[i]["label"]) for i in idx], device=dev))
        opt.zero_grad(); loss.backward(); opt.step()
    print("epoch", ep, "done")
os.makedirs(os.path.join(MODELS, "checkpoints"), exist_ok=True); torch.save({"state": m.state_dict(), "labels": labels}, os.path.join(MODELS, "checkpoints", "dintel_core_transformer_v1.pt"))
print("saved; evaluate on dev with ml/scripts/evaluate.py after adding a transformer predictor (kept out of the deployed path until measured)")
