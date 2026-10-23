import _bootstrap, json, os, yaml_lite
from dintel.core import train_all, ROOT
cfg = yaml_lite.load(os.path.join(ROOT, "configs", "model_config.yaml")).get("core_text_model", {})
rep = train_all(cfg)
for t, v in rep["tasks"].items():
    print(f"{t:24s} selected={v['selected']:26s} dev macroF1={v['dev_metrics_selected']['macro_f1']:.4f} acc={v['dev_metrics_selected']['accuracy']:.4f} T={v['calibration']['temperature']:.2f} ECE {v['calibration']['dev_ece_uncalibrated']:.3f}->{v['calibration']['dev_ece_calibrated']:.3f}")
    for n, m in v["dev_candidates"].items(): print(f"    {n:26s} macroF1={m['macro_f1']:.4f} acc={m['accuracy']:.4f}")
