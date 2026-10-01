"""Fine-tune YOLOv8n as the E-REF food detector.

The COCO-pretrained ``yolov8n.pt`` only knows apple, banana, orange and a few other
generic food words. This starts from it and fine-tunes on the annotated frames written
by ``build_detection_dataset.py``, so it learns to box each of the app's 12 foods.

Weights land in ``runs/detect/eref_detector_v1/weights/best.pt``, where ``pipeline.py``
looks for them.

    python backend/build_detection_dataset.py
    python backend/train_detector.py --device cpu --epochs 15
    python backend/train_detector.py --resume         # continue an interrupted run
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA = PROJECT_ROOT / "Datasets" / "dataset" / ".training" / "eref_detect_v1" / "data.yaml"
RUNS = PROJECT_ROOT / "runs" / "detect"
NAME = "eref_detector_v1"
BASE_WEIGHTS = PROJECT_ROOT / "yolov8n.pt"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--imgsz", type=int, default=416)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--device", default="cpu", help="'0' for the first GPU, 'cpu' otherwise")
    parser.add_argument("--resume", action="store_true", help="continue an interrupted run from last.pt")
    args = parser.parse_args()

    from ultralytics import YOLO

    if not DATA.exists():
        raise SystemExit(f"{DATA} not found. Run backend/build_detection_dataset.py first.")

    best = RUNS / NAME / "weights" / "best.pt"
    last = RUNS / NAME / "weights" / "last.pt"
    if args.resume and last.exists():
        try:
            YOLO(str(last)).train(resume=True)
        except AssertionError as error:
            print(f"nothing to resume ({error}); keeping {best}", flush=True)
        print(f"detector weights: {best}")
        return

    YOLO(str(BASE_WEIGHTS)).train(
        data=str(DATA),
        epochs=args.epochs,
        patience=8,
        imgsz=args.imgsz,
        batch=args.batch,
        workers=args.workers,
        device=args.device,
        project=str(RUNS),
        name=NAME,
        exist_ok=True,
        cos_lr=True,
        # The frames are composed on flat backdrops; colour and scale jitter keeps the
        # detector from leaning on the backdrop or on one object size.
        scale=0.5,
        hsv_h=0.03,
        hsv_s=0.6,
        hsv_v=0.4,
        mosaic=0.5,
        close_mosaic=3,
        plots=False,
        verbose=False,
    )
    print(f"detector weights: {best}")


if __name__ == "__main__":
    sys.exit(main())
