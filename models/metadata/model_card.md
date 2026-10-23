# Model card — dintel-core-v1.0.0 (+ dintel-fusion-v1.0.0)
**Intended use:** decision support for emergency operators — triage of citizen disaster reports (informativeness, humanitarian category, damage severity proxy, hazard family) and a derived, explainable review/priority recommendation. Always with a human in the loop.
**Not intended for:** automatic dispatch, rejecting reports, life-safety decisions without operator review, non-English text, hazards outside {Flood, Tropical cyclone, Earthquake, Wildfire} without operator confirmation, identity inference.

**Architecture:** shared TF-IDF (1–2 gram, sublinear, 24,715 features, event-name masking) → per-task linear heads selected on dev (LogReg balanced for informative & severity, LinearSVM balanced for humanitarian & disaster type) → temperature scaling per head (fit on dev). Layer B: rule-based fusion, untrained.
**Dataset:** CrisisMMD v2.0 text + labels (see DATASET.md). **Version fields:** model_version dintel-core-v1.0.0 · dataset_version crisismmd-v2.0-datasplit-all · label_mapping 1.0.0 · feature_registry 1.0.0 · calibration temp-scaling-v1 · sha256 in models/metadata/dintel_core_v1.json.

## Metrics (held-out test)
| task | model | n | acc | macro F1 | wF1 | ECE raw→cal | Brier |
|---|---|---|---|---|---|---|---|
| informative | tfidf_logreg_balanced | 2237 | 0.802 | 0.755 | 0.803 | 0.025 → 0.017 | 0.283 · ROC-AUC 0.835, PR-AUC 0.918 |
| humanitarian_category | tfidf_linearsvm_balanced | 2237 | 0.642 | 0.525 | 0.640 | 0.359 → 0.042 | 0.496 |
| damage_severity | tfidf_logreg_balanced | 520 | 0.577 | 0.373 | 0.530 | 0.057 → 0.048 | 0.528 · severe recall 0.829, severe under-prediction 0.171 |
| disaster_type | tfidf_linearsvm_balanced | 2237 | 0.981 | 0.965 | 0.981 | 0.325 → 0.005 | 0.031 |

## Calibration status
Calibrated by temperature scaling on the dev split; ECE/Brier reported above. `response_priority.confidence` is a **heuristic and uncalibrated** (flagged in every response).

## Limitations & bias risks
* Geographic: trained on 2017 US/Caribbean/Mexico/Iran–Iraq/Sri Lanka Twitter data; India-specific vocabulary (waterlogging, nallah, tehsil…) under-represented → OOD flag via vocabulary coverage.
* Linguistic: English only; Hinglish/Hindi produce warnings, not predictions of quality.
* Prior bias: 74% hurricane tweets → hazard-word-free text drifts to Tropical cyclone (see /failures).
* Severity: text proxy of image labels; Mild/Little classes weak (macro-F1 0.373) although severe recall is 0.829.
* Rare humanitarian classes (missing people n=6, vehicle damage n=7 in test) are unreliable.
* No image understanding; detector evidence is trusted only as *evidence*.

## Known failure cases
"Large cracks appeared in the walls after strong shaking" → Tropical cyclone (no "earthquake" token). "Smoke and flames… wind is pushing it" → Tropical cyclone ("wind"). Donation/volunteer tweets often mis-assigned between *Other relevant* and *Rescue*.

## Safety
Uncertainty → `requires_human_review`, never rejection. Conservative rules for severe predictions without corroboration. Identity fields never used. Raw text/GPS not logged by default.
