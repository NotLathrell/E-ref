"""Build the retraining datasets from every image folder under ``Datasets/``.

Two ImageFolder datasets are written under ``Datasets/dataset/.training/eref_v2``:

  identity/    25 classes: 12 foods x fresh/rotten, plus ``other`` for anything
               that is not one of the app's foods (other fruit, meat...). The app
               can then say "unknown food" instead of forcing an answer.
  freshness/   fresh vs rotten, trained on produce and on the meat photos of
               ``dataset2``.

Three of the twelve foods — mango, papaya and eggplant — are common in Philippine
cooking and were not covered by any of this project's original sources. They were
added from separate public collections under ``Datasets/ph_extra/`` (downloaded
into that folder, not committed — see ``backend/README.md`` for the exact source,
licence and citation of each):

  mango       "FruitVision" (Mendeley, CC BY-NC-ND 4.0) — Fresh/Rotten photos.
              Its "Formalin-mixed" class (chemically adulterated, not naturally
              spoiled) is not used.
  papaya      "Papaya Freshness Classification Dataset" (Mendeley, CC BY 4.0) —
              GOOD/BAD photos.
  eggplant    "BrinjalFruitX" (Mendeley, CC BY 4.0) — fruit photos in five
              condition classes. Only the healthy class maps to "fresh"; pest
              damage, cracking and disease all map to "rotten", since none of
              them is fruit a home cook would judge fit to eat as-is.

Held-out data is kept out of training on purpose:

  * Original ``val`` / ``Test`` images that are not also in ``train`` are kept out of
    every pool, so ``evaluate.py`` keeps scoring the same independent images as before.
  * ``identity_unseen/`` holds foods the model never trains on (persimmon, peach,
    pear, grape, kiwi, corn, onion, carrot...). The model should answer ``other``
    for them. Mango and eggplant are excluded from this set (see ``KNOWN_SEM``)
    now that they are trained foods, not unseen ones.
  * ``freshness_ext/`` is ``dataset2/test`` in full, a different photographer and
    scene from ``dataset2/train``.
  * Foods of the app that exist only in ``sem_classificacao`` are never trained on;
    they stay an external identity test (see ``benchmark.py``).

Inside the training pool, images are assigned to train / val / test by their content
hash (82 / 9 / 9 %), so both datasets share one split and nothing leaks between them.
Images are downscaled to at most 384 px so training is not bound by JPEG decoding.

    python backend/build_dataset.py
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATASETS = PROJECT_ROOT / "Datasets"
ORIG = DATASETS / "dataset" / ".training" / "food_multiclass"
FV = DATASETS / "Dataset-FV"
DS2 = DATASETS / "dataset2"
PH = DATASETS / "ph_extra"
OUT = DATASETS / "dataset" / ".training" / "eref_v2"

# Three foods common in the Philippines, added from separate public collections
# (none of the app's existing sources cover them). Each maps that collection's own
# quality folders onto this app's fresh/rotten split; see build_dataset.py's module
# docstring update below and backend/README.md for the source and licence of each.
MANGO_DIR = PH / "mango" / "Fruits Original" / "Mango"
PAPAYA_DIR = PH / "papaya" / "Dataset"
EGGPLANT_DIR = PH / "eggplant"
# Only "Healty Brinjal" (their spelling) is a clean, undamaged fruit; the other four
# folders are pest, crack and disease damage, which this app reports as "rotten"
# since a home cook would not judge them fit to eat as-is.
EGGPLANT_ROTTEN_DIRS = (
    "Wet Rot",
    "Shoot and Fruit Borer",
    "Brinjal Fruit Creaking",
    "Phomopsis Bright",
)

EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
MAX_SIDE = 384

# Portuguese folder -> the label stem used by the original dataset.
KNOWN_FV = {
    "banana": "banana",
    "laranja": "oranges",
    "maca": "apples",
    "pepino": "cucumber",
    "pimentao": "capsicum",
    "tomate": "tomato",
}
# Foods in Dataset-FV the model never trains on, to test "unknown food" handling.
UNSEEN_COM = {"caqui", "pessego"}
UNSEEN_SEM = {"pera", "uva", "cebola", "cenoura", "kiwi", "milho"}
# Foods of the app that appear in Dataset-FV's unlabelled folder; skipped rather than
# fed to the "other"/unknown pools, since the app now identifies them (mango and eggplant
# were added from separate Mendeley datasets; treating them as "other" here would teach
# the model to contradict the labelled examples of the same foods).
KNOWN_SEM = {"banana", "laranja", "maca", "pepino", "pimentao", "tomate", "batata", "manga", "berinjela"}

CAP_OTHER_COM = 250  # per unknown food and quality
# Dataset-FV's unlabelled folder is mostly single cut-outs on a white background. Used as
# the "other" class, they taught the first retrained model that "white background means
# unknown" (90% of the app's own foods on white were rejected), so none are trained on.
CAP_OTHER_SEM = 0
CAP_OTHER_MEAT = 500
CAP_UNSEEN_COM = 150
CAP_UNSEEN_SEM = 40
CAP_UNSEEN_MEAT = 300


def md5(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def images(folder: Path) -> list[Path]:
    return sorted(f for f in folder.rglob("*") if f.is_file() and f.suffix.lower() in EXTS)


def spread(files: list[Path], cap: int) -> list[Path]:
    """Even stride through a folder so a cap keeps the whole range, not the first N."""
    if cap <= 0 or len(files) <= cap:
        return files
    step = len(files) / cap
    return [files[int(i * step)] for i in range(cap)]


def bucket(digest: str) -> str:
    n = int(digest[:8], 16) % 100
    return "train" if n < 82 else "val" if n < 91 else "test"


def save_resized(job: tuple[str, str]) -> bool:
    src, dst = job
    try:
        with Image.open(src) as im:
            im = im.convert("RGB")
            im.thumbnail((MAX_SIDE, MAX_SIDE))
            Path(dst).parent.mkdir(parents=True, exist_ok=True)
            im.save(dst, "JPEG", quality=92)
        return True
    except Exception:  # noqa: BLE001 - a corrupt file is skipped, not fatal
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=OUT)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()
    out: Path = args.out

    print("Hashing the original train / val / Test images ...", flush=True)
    reserved: set[str] = set()
    for folder in (ORIG / "val", DATASETS / "dataset" / "Test"):
        if folder.exists():
            reserved |= {md5(f) for f in images(folder)}
    # Most of the original val is a copy of train. Those copies are ordinary training
    # images; only the val images that train has never seen are held back.
    reserved -= {md5(f) for f in images(ORIG / "train")}
    print(f"  {len(reserved)} independent val/Test images reserved for evaluate.py", flush=True)

    # (source path, destination stem, identity label|None, freshness|None, split-kind)
    # split-kind: "pool" (hash split), "unseen" (identity test only), "ext" (freshness test only)
    entries: list[dict] = []

    def add(path: Path, kind: str, identity: str | None, fresh: str | None, source: str) -> None:
        entries.append({"path": path, "kind": kind, "identity": identity, "fresh": fresh, "source": source})

    # 1. original training set (18 joint labels)
    for class_dir in sorted(p for p in (ORIG / "train").iterdir() if p.is_dir()):
        fresh = "rotten" if class_dir.name.startswith("rotten") else "fresh"
        for f in images(class_dir):
            add(f, "pool", class_dir.name, fresh, "original")

    # 2. Dataset-FV, labelled good/bad
    for quality, fresh in (("bom", "fresh"), ("ruim", "rotten")):
        base = FV / "com_classificacao" / quality
        for food_dir in sorted(p for p in base.iterdir() if p.is_dir()):
            name = food_dir.name
            files = images(food_dir)
            if name in KNOWN_FV:
                label = f"{fresh}_{KNOWN_FV[name]}"
                for f in files:
                    add(f, "pool", label, fresh, f"fv-com/{name}")
            elif name in UNSEEN_COM:
                for f in spread(files, CAP_UNSEEN_COM):
                    add(f, "unseen", "other", fresh, f"fv-com-unseen/{name}")
            else:
                for f in spread(files, CAP_OTHER_COM):
                    add(f, "pool", "other", fresh, f"fv-com-other/{name}")

    # 3. Dataset-FV, unlabelled quality: held-out foods only feed the "unknown" test
    for food_dir in sorted(p for p in (FV / "sem_classificacao").iterdir() if p.is_dir()):
        name = food_dir.name
        if name in KNOWN_SEM:
            continue
        files = images(food_dir)
        if name in UNSEEN_SEM:
            for f in spread(files, CAP_UNSEEN_SEM):
                add(f, "unseen", "other", None, f"fv-sem-unseen/{name}")
        elif CAP_OTHER_SEM > 0:
            for f in spread(files, CAP_OTHER_SEM):
                add(f, "pool", "other", None, f"fv-sem-other/{name}")

    # 4. dataset2: fresh / rotten beef. train feeds both models, test is the external freshness set
    for quality in ("fresh", "rotten"):
        train_files = images(DS2 / "train" / "train" / quality)
        for f in train_files:
            add(f, "pool-meat", None, quality, "dataset2-train")
        for f in images(DS2 / "test" / "test" / quality):
            add(f, "ext", None, quality, "dataset2-test")

    # 5. Philippine-relevant additions: mango, papaya, eggplant
    for quality, fresh in (("Fresh", "fresh"), ("Rotten", "rotten")):
        for f in images(MANGO_DIR / quality):
            add(f, "pool", f"{fresh}_mango", fresh, f"ph-mango/{quality}")

    for quality, fresh in (("GOOD", "fresh"), ("BAD", "rotten")):
        for f in images(PAPAYA_DIR / quality):
            add(f, "pool", f"{fresh}_papaya", fresh, f"ph-papaya/{quality}")

    for f in images(EGGPLANT_DIR / "Healty Brinjal"):
        add(f, "pool", "fresh_eggplant", "fresh", "ph-eggplant/Healty Brinjal")
    for class_dir in EGGPLANT_ROTTEN_DIRS:
        for f in images(EGGPLANT_DIR / class_dir):
            add(f, "pool", "rotten_eggplant", "rotten", f"ph-eggplant/{class_dir}")

    print(f"Hashing {len(entries)} candidate images ...", flush=True)
    seen: set[str] = set()
    kept: list[dict] = []
    dropped_reserved = dropped_dupe = 0
    for e in entries:
        digest = md5(e["path"])
        if digest in reserved:
            dropped_reserved += 1
            continue
        if digest in seen:
            dropped_dupe += 1
            continue
        seen.add(digest)
        e["md5"] = digest
        kept.append(e)
    print(f"  kept {len(kept)}  (dropped {dropped_reserved} held-out val/Test, {dropped_dupe} byte-duplicates)", flush=True)

    # meat images: cap what feeds the identity "other" class, all of them feed freshness
    meat_identity = spread([e for e in kept if e["kind"] == "pool-meat"], CAP_OTHER_MEAT)
    meat_identity_ids = {e["md5"] for e in meat_identity}
    ext_meat_identity = {e["md5"] for e in spread([e for e in kept if e["kind"] == "ext"], CAP_UNSEEN_MEAT)}

    if out.exists():
        shutil.rmtree(out)

    jobs: list[tuple[str, str]] = []
    links: list[tuple[str, str]] = []
    counts: dict[str, int] = {}

    stored: dict[str, Path] = {}

    def put(e: dict, dataset: str, split: str | None, cls: str) -> None:
        parts = [dataset] + ([split] if split else []) + [cls]
        dst = out.joinpath(*parts) / f"{e['md5']}.jpg"
        stem = e["md5"]
        if stem not in stored:
            stored[stem] = dst
            jobs.append((str(e["path"]), str(dst)))
        else:
            links.append((str(stored[stem]), str(dst)))
        key = f"{dataset}/{split or '-'}/{cls}"
        counts[key] = counts.get(key, 0) + 1

    for e in kept:
        kind = e["kind"]
        if kind in ("pool", "pool-meat"):
            split = bucket(e["md5"])
            if e["identity"] is not None:
                put(e, "identity", split, e["identity"])
            elif e["md5"] in meat_identity_ids:
                put(e, "identity", split, "other")
            if e["fresh"] is not None:
                put(e, "freshness", split, e["fresh"])
        elif kind == "unseen":
            put(e, "identity_unseen", None, "other")
        elif kind == "ext":
            put(e, "freshness_ext", None, e["fresh"])
            if e["md5"] in ext_meat_identity:
                put(e, "identity_unseen", None, "other")

    print(f"Writing {len(jobs)} resized images with {args.workers} workers ...", flush=True)
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        ok = list(pool.map(save_resized, jobs, chunksize=64))
    failed = {jobs[i][1] for i, good in enumerate(ok) if not good}
    print(f"  {len(jobs) - len(failed)} written, {len(failed)} unreadable", flush=True)

    for src, dst in links:
        if src in failed:
            continue
        Path(dst).parent.mkdir(parents=True, exist_ok=True)
        try:
            os.link(src, dst)
        except OSError:
            shutil.copy2(src, dst)
    for path in failed:
        Path(path).unlink(missing_ok=True)

    print("\nImages per split and class:")
    for dataset in ("identity", "freshness"):
        for split in ("train", "val", "test"):
            rows = {k: v for k, v in counts.items() if k.startswith(f"{dataset}/{split}/")}
            print(f"  {dataset}/{split}: {sum(rows.values())} images in {len(rows)} classes")
    for dataset in ("identity_unseen", "freshness_ext"):
        rows = {k: v for k, v in counts.items() if k.startswith(f"{dataset}/")}
        print(f"  {dataset}: {sum(rows.values())} images  {rows}")
    print("\nPer-class counts (identity/train):")
    for k in sorted(counts):
        if k.startswith("identity/train/"):
            print(f"  {k.split('/')[-1]:<20}{counts[k]:>6}")
    print(f"\nWrote {out}")


if __name__ == "__main__":
    sys.exit(main())
