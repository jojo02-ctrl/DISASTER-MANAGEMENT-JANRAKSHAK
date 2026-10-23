# Image / multimodal training path (not executed in this build)
1. `python ml/scripts/download_crisismmd.py --with-images` and extract CrisisMMD_v2.0.tar.gz (2.1GB) into data/raw/CrisisMMD_v2.0/
2. Use `label_image` from task_damage_* / task_humanitarian_* / task_informative_* splits (image-level labels).
3. EfficientNet-B0 (timm) transfer learning; augmentations limited to resize/crop/h-flip/mild colour (never label-changing).
4. Gated late fusion with the text head; evaluate experiments B/C/E and write to reports/metrics.json.
No image or multimodal metrics are claimed until this is run.
