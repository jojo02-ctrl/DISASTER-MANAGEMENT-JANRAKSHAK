"""python ml/scripts/predict.py --text "..."   |   python ml/scripts/predict.py --janrakshak tests/fixtures/janrakshak/flood.json
The --janrakshak path runs the Python core model on the adapter-selected text (rawText > description > title).
Full Layer-B fusion lives in the TypeScript service (src/lib/dintel) and the /api/predict/janrakshak endpoint."""
import _bootstrap, argparse, json
from dintel.core import predict_text
ap = argparse.ArgumentParser(); ap.add_argument("--text"); ap.add_argument("--janrakshak"); a = ap.parse_args()
if a.janrakshak:
    p = json.load(open(a.janrakshak)); text = p.get("rawText") or p.get("description") or p.get("title") or ""
    print("adapter text:", text)
else:
    text = a.text or ""
print(json.dumps(predict_text(text), indent=1))
