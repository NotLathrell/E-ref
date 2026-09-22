"""Train the E-REF classifiers on the datasets written by ``build_dataset.py``.

  identity   YOLOv8n-cls, 19 classes (9 foods x fresh/rotten, plus ``other``)
  freshness  YOLOv8n-cls, fresh vs rotten

Weights land in ``runs/classify/runs/classify/<name>/weights/best.pt``, the location
``pipeline.py`` loads from. Training uses the GPU when one is available.

    python backend/build_dataset.py
    python backend/train.py                    # both models
    python backend/train.py --task identity --epochs 40
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA = PROJECT_ROOT / "Datasets" / "dataset" / ".training" / "eref_v2"
RUNS = PROJECT_ROOT / "runs" / "classify" / "runs" / "classify"
BASE_WEIGHTS = PROJECT_ROOT / "yolov8n-cls.pt"

TASKS = {"identity": "eref_identity_v2", "freshness": "eref_freshness_v2"}


def train(task: str, epochs: int, batch: int, imgsz: int, workers: int, device: str, resume: bool = False) -> Path:
    from ultralytics import YOLO

    data = DATA / task
    if not (data / "train").exists():
        raise SystemExit(f"{data} not found. Run backend/build_dataset.py first.")

    best = RUNS / TASKS[task] / "weights" / "best.pt"
    last = RUNS / TASKS[task] / "weights" / "last.pt"
    if resume and last.exists():
        # Picks up an interrupted run at its last finished epoch, with the same settings.
        # A run that already finished has nothing to resume, so it is left as it is.
        try:
            YOLO(str(last)).train(resume=True)
        except AssertionError as error:
            print(f"[{task}] nothing to resume ({error}); keeping {best}", flush=True)
        return best

    model = YOLO(str(BASE_WEIGHTS))
    model.train(
        data=str(data),
        epochs=epochs,
        patience=10,
        imgsz=imgsz,
        batch=batch,
        workers=workers,
        device=device,
        project=str(RUNS),
        name=TASKS[task],
        exist_ok=True,
        cos_lr=True,
        # Phone photos vary in framing, lighting and colour cast far more than the
        # studio-style training images, so augment harder than the default.
        scale=0.5,
        hsv_h=0.03,
        hsv_s=0.6,
        hsv_v=0.5,
        erasing=0.3,
        label_smoothing=0.05,
        plots=False,
        verbose=False,
    )
    return RUNS / TASKS[task] / "weights" / "best.pt"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--task", choices=["identity", "freshness", "all"], default="all")
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch", type=int, default=64)
    parser.add_argument("--imgsz", type=int, default=224)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--resume", action="store_true", help="continue interrupted runs from last.pt")
    parser.add_argument("--device", default="0", help="'0' for the first GPU, 'cpu' otherwise")
    args = parser.parse_args()

    tasks = list(TASKS) if args.task == "all" else [args.task]
    for task in tasks:
        best = train(task, args.epochs, args.batch, args.imgsz, args.workers, args.device, args.resume)
        print(f"\n[{task}] best weights: {best}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
