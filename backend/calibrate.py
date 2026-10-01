"""Measure how trustworthy the classifiers' confidence is, and pick the review thresholds.

A CNN always names *something*, and a photo of a food it never saw (a mango when it
was not trained on mangoes, say) still gets a confident-looking label. So "what
confidence is acceptable?" cannot be answered from a rule of thumb; it depends on how
often the model is right when it reports each confidence. This script measures that on
photos held out from training:

  * known foods   the identity test split (12 foods, fresh and rotten)
  * cut-outs      plain-background product photos of the app's own foods, which the models
                  were deliberately never trained on. They are the hardest realistic photo of
                  a food the model does know, so they show what a threshold costs when the
                  model is right but less sure.
  * unseen foods  ``identity_unseen``, foods the model was never trained on. A good
                  threshold sends these to "please confirm" instead of naming a food.
  * freshness     the fresh/rotten test split, for the freshness confidence.

For every threshold it reports how many known photos are accepted without confirming,
how accurate those are, and how many unseen-food photos slip through as a confident
wrong answer. Results go to ``backend/metrics/confidence_calibration.json``.

    python backend/calibrate.py
    python backend/calibrate.py --per-class 60
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.labels import OTHER_LABEL, food_name_from_label  # noqa: E402
from backend.pipeline import (  # noqa: E402
    CONFIDENT_IDENTITY,
    FRESHNESS_YOLO_PATH,
    IDENTITY_PATH,
    UNSURE_FRESHNESS,
    UNSURE_IDENTITY,
    yolo_prob_rotten,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA = PROJECT_ROOT / "Datasets" / "dataset" / ".training" / "eref_v2"
CUTOUTS = PROJECT_ROOT / "Datasets" / "Dataset-FV" / "sem_classificacao"
# Dataset-FV's folder names (Portuguese) and the app's food for each.
CUTOUT_FOODS = {
    "banana": "banana", "laranja": "orange", "maca": "apple", "pepino": "cucumber",
    "pimentao": "capsicum", "tomate": "tomato", "batata": "potato",
}
OUTPUT = Path(__file__).resolve().parent / "metrics" / "confidence_calibration.json"
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
THRESHOLDS = [round(0.30 + 0.05 * i, 2) for i in range(0, 15)]  # 0.30 .. 1.00


def sample(folder: Path, count: int, rng: random.Random) -> list[Path]:
    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in EXTENSIONS)
    rng.shuffle(files)
    return files[:count]


def identity_rows(model, per_class: int, rng: random.Random) -> tuple[list[dict], list[dict], list[dict]]:
    """Top-1 confidence and correctness for known-food, plain cut-out and unseen-food photos."""
    known: list[dict] = []
    for folder in sorted((DATA / "identity" / "test").iterdir()):
        if not folder.is_dir() or folder.name == OTHER_LABEL:
            continue
        truth = food_name_from_label(folder.name)
        for path in sample(folder, per_class, rng):
            result = model.predict(str(path), verbose=False)[0]
            probs = result.probs.data.cpu().numpy()
            top = int(probs.argmax())
            label = str(result.names[top])
            known.append({"confidence": float(probs[top]), "correct": food_name_from_label(label) == truth})

    cutouts: list[dict] = []
    for folder_name, truth in CUTOUT_FOODS.items():
        folder = CUTOUTS / folder_name
        if not folder.exists():
            continue
        for path in sample(folder, per_class, rng):
            result = model.predict(str(path), verbose=False)[0]
            probs = result.probs.data.cpu().numpy()
            top = int(probs.argmax())
            cutouts.append({"confidence": float(probs[top]), "correct": food_name_from_label(str(result.names[top])) == truth})

    unseen: list[dict] = []
    for path in sample(DATA / "identity_unseen" / OTHER_LABEL, per_class * 6, rng):
        result = model.predict(str(path), verbose=False)[0]
        probs = result.probs.data.cpu().numpy()
        top = int(probs.argmax())
        label = str(result.names[top])
        # "Named a food" is the mistake: the right answer is unknown (the other class).
        unseen.append({"confidence": float(probs[top]), "namedAFood": food_name_from_label(label) is not None})
    return known, cutouts, unseen


def freshness_rows(model, per_class: int, rng: random.Random) -> list[dict]:
    rows: list[dict] = []
    root = DATA / "freshness" / "test"
    if not root.exists():
        return rows
    for folder in sorted(root.iterdir()):
        if not folder.is_dir():
            continue
        truth_rotten = folder.name.lower().startswith("rot")
        for path in sample(folder, per_class * 4, rng):
            prob = yolo_prob_rotten(model.predict(str(path), verbose=False)[0])
            if prob is None:
                continue
            call_rotten = prob >= 0.5
            rows.append({"confidence": max(prob, 1 - prob), "correct": call_rotten == truth_rotten})
    return rows


def identity_table(known: list[dict], cutouts: list[dict], unseen: list[dict]) -> list[dict]:
    table = []
    for t in THRESHOLDS:
        accepted = [r for r in known if r["confidence"] >= t]
        hard = [r for r in cutouts if r["confidence"] >= t]
        wrong_unseen = [r for r in unseen if r["confidence"] >= t and r["namedAFood"]]
        table.append(
            {
                "threshold": t,
                "knownAccepted": round(len(accepted) / len(known), 4) if known else None,
                "acceptedAccuracy": round(sum(r["correct"] for r in accepted) / len(accepted), 4) if accepted else None,
                "cutoutsAccepted": round(len(hard) / len(cutouts), 4) if cutouts else None,
                "cutoutsAcceptedAccuracy": round(sum(r["correct"] for r in hard) / len(hard), 4) if hard else None,
                "unseenWronglyAccepted": round(len(wrong_unseen) / len(unseen), 4) if unseen else None,
            }
        )
    return table


def freshness_table(rows: list[dict]) -> list[dict]:
    table = []
    for t in THRESHOLDS:
        accepted = [r for r in rows if r["confidence"] >= t]
        table.append(
            {
                "threshold": t,
                "accepted": round(len(accepted) / len(rows), 4) if rows else None,
                "acceptedAccuracy": round(sum(r["correct"] for r in accepted) / len(accepted), 4) if accepted else None,
            }
        )
    return table


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--per-class", type=int, default=40, help="known-food photos sampled per class")
    parser.add_argument("--seed", type=int, default=11)
    args = parser.parse_args()

    from ultralytics import YOLO

    rng = random.Random(args.seed)
    started = time.time()

    identity = YOLO(str(IDENTITY_PATH))
    known, cutouts, unseen = identity_rows(identity, args.per_class, rng)
    print(f"identity: {len(known)} known photos, {len(cutouts)} plain cut-outs, {len(unseen)} unseen-food photos", flush=True)

    fresh_rows: list[dict] = []
    if FRESHNESS_YOLO_PATH.exists():
        fresh_rows = freshness_rows(YOLO(str(FRESHNESS_YOLO_PATH)), args.per_class, rng)
        print(f"freshness: {len(fresh_rows)} photos", flush=True)

    id_table = identity_table(known, cutouts, unseen)
    fr_table = freshness_table(fresh_rows)

    print("\nIdentity confidence (accept = shown without asking the user to confirm)")
    print("            same-collection photos      plain cut-outs (harder)      unseen foods")
    print("  at least  accepted  accuracy          accepted  accuracy           wrongly named")
    for row in id_table:
        print(
            f"  {row['threshold']:>8.2f}  {row['knownAccepted']:>8.1%}  {(row['acceptedAccuracy'] or 0):>8.1%}          "
            f"{(row['cutoutsAccepted'] or 0):>8.1%}  {(row['cutoutsAcceptedAccuracy'] or 0):>8.1%}           "
            f"{row['unseenWronglyAccepted']:>8.1%}"
        )
    if fr_table:
        print("\nFreshness confidence")
        print("  threshold  accepted  accuracy of accepted")
        for row in fr_table:
            print(f"  {row['threshold']:>8.2f}  {(row['accepted'] or 0):>8.1%}  {(row['acceptedAccuracy'] or 0):>20.1%}")

    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "sample": {"knownIdentity": len(known), "plainCutouts": len(cutouts), "unseenFoods": len(unseen), "freshness": len(fresh_rows)},
        "identity": id_table,
        "freshness": fr_table,
        "inUse": {
            "confidentIdentity": CONFIDENT_IDENTITY,
            "unsureIdentity": UNSURE_IDENTITY,
            "unsureFreshness": UNSURE_FRESHNESS,
        },
        "note": (
            "Measured on photos held out from training. 'unseenWronglyAccepted' counts "
            "photos of foods the model was never trained on that still got a confident food name."
        ),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nwrote {OUTPUT} in {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
