import _bootstrap, json
from dintel.core import evaluate_test
m, f = evaluate_test()
for t, v in m["tasks"].items():
    extra = f" severe_recall={v.get('severe_recall'):.3f}" if v.get("severe_recall") is not None else ""
    extra += f" roc_auc={v['roc_auc']:.3f}" if "roc_auc" in v else ""
    print(f"{t:24s} acc={v['accuracy']:.4f} macroF1={v['macro_f1']:.4f} wF1={v['weighted_f1']:.4f} ECE={v['calibration']['ece_calibrated']:.4f} (raw {v['calibration']['ece_uncalibrated']:.4f}) Brier={v['calibration']['brier_calibrated']:.4f}{extra}")
