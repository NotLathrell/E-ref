"""Train the apple variety classifier on the dataset ``build_apple_varieties.py`` writes.

A second, optional YOLOv8n-cls model — same tool as the identity classifier, same
reason (a CNN is the right fit for this kind of image classification), but answering
a different, independent question ("which variety") that doesn't touch the
fresh/rotten verdict. See build_apple_varieties.py and backend/variety.py.

Weights land in ``runs/classify/runs/classify/eref_apple_variety_v1/weights/best.pt``,
the location ``variety.py`` loads from.

    python backend/build_apple_varieties.py
    python backend/train_apple_variety.py
"""

from __future__ import annotations

import argparse
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA = PROJECT_ROOT / "Datasets" / "dataset" / ".training" / "apple_variety_v1"
RUNS = PROJECT_ROOT / "runs" / "classify" / "runs" / "classify"
BASE_WEIGHTS = PROJECT_ROOT / "yolov8n-cls.pt"
NAME = "eref_apple_variety_v1"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--imgsz", type=int, default=224)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()

    from ultralytics import YOLO

    if not (DATA / "train").exists():
        raise SystemExit(f"{DATA} not found. Run backend/build_apple_varieties.py first.")

    last = RUNS / NAME / "weights" / "last.pt"
    if args.resume and last.exists():
        try:
            YOLO(str(last)).train(resume=True)
        except AssertionError as error:
            print(f"nothing to resume ({error}); keeping existing weights", flush=True)
        return

    model = YOLO(str(BASE_WEIGHTS))
    model.train(
        data=str(DATA),
        epochs=args.epochs,
        patience=10,
        imgsz=args.imgsz,
        batch=args.batch,
        workers=args.workers,
        device=args.device,
        project=str(RUNS),
        name=NAME,
        exist_ok=True,
        cos_lr=True,
        # Same reasoning as the identity/freshness models: phone photos vary far
        # more in framing, lighting and colour cast than these studio photos.
        scale=0.5,
        hsv_h=0.03,
        hsv_s=0.6,
        hsv_v=0.5,
        erasing=0.3,
        label_smoothing=0.05,
        plots=False,
        verbose=False,
    )
    print(f"\nbest weights: {RUNS / NAME / 'weights' / 'best.pt'}", flush=True)


if __name__ == "__main__":
    main()
