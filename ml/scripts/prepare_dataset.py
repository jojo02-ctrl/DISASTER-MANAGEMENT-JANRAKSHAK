import _bootstrap, json
from dintel.core import build_dataset
_, report = build_dataset()
print(json.dumps({t: {s: v["n"] for s, v in report["tasks"][t].items() if isinstance(v, dict)} for t in report["tasks"]}, indent=1))
print("contamination:", json.dumps(report["contamination_control"], indent=1))
