"""Build the apple variety dataset from the AFVC collection.

Variety is a separate, optional question from freshness: no public dataset labels a
photo with both a cultivar (Fuji, Gala...) and a fresh/rotten state at once, so this
is a second, independent classifier that only answers "which variety", run after the
main identity model has already said "this is an apple". It does not feed the
fresh/rotten clustering, which stays decided at the apple level as before.

Source: AFVC (Apple Fruit Varieties Collection, Mhamed & Zhang, academic use,
``Datasets/ph_extra/apple_varieties/AFVC-main/``, see backend/README.md), 85
varieties x 315 train + 35 test. Of those, this project uses the five varieties
actually sold as imported apples in Philippine groceries and that a user is likely
to be able to name: Fuji, Gala, Granny Smith, Red Delicious, Golden Delicious.
"Washington Apple" (the other name requested) is not itself a cultivar — it is a
US regional/marketing label, historically most associated with Red Delicious — so
it is covered by mapping to Red Delicious rather than treated as a sixth class.

    python backend/build_apple_varieties.py
"""

from __future__ import annotations

import hashlib
import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC = PROJECT_ROOT / "Datasets" / "ph_extra" / "apple_varieties" / "AFVC-main"
OUT = PROJECT_ROOT / "Datasets" / "dataset" / ".training" / "apple_variety_v1"

# AFVC folder name -> this project's class name (see labels.py's style: lowercase,
# no separator; VARIETY_LABELS in variety.py maps it back to a display name).
VARIETIES = {
    "84_Fuji": "fuji",
    "85_Gala": "gala",
    "82_Granny Smith": "grannysmith",
    "81_Red Delicious": "reddelicious",
    "83_Golden Delicious": "goldendelicious",
}

EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
VAL_FRACTION = 0.12  # carved out of AFVC's own Train split; AFVC's Test becomes ours


def md5(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def images(folder: Path) -> list[Path]:
    return sorted(p for p in folder.iterdir() if p.suffix.lower() in EXTS)


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)

    counts: dict[str, dict[str, int]] = {}
    for afvc_name, class_name in VARIETIES.items():
        train_files = images(SRC / "Train" / afvc_name)
        test_files = images(SRC / "Test" / afvc_name)

        # A deterministic, content-hashed slice of train becomes val, the same
        # approach build_dataset.py uses, so nothing here depends on file order.
        val_files = [f for f in train_files if int(md5(f)[:4], 16) / 0xFFFF < VAL_FRACTION]
        val_ids = {f.name for f in val_files}
        remaining_train = [f for f in train_files if f.name not in val_ids]

        for split, files in (("train", remaining_train), ("val", val_files), ("test", test_files)):
            dest = OUT / split / class_name
            dest.mkdir(parents=True, exist_ok=True)
            for f in files:
                shutil.copy2(f, dest / f.name)

        counts[class_name] = {"train": len(remaining_train), "val": len(val_files), "test": len(test_files)}

    print("Apple variety dataset:")
    for class_name, c in counts.items():
        print(f"  {class_name:16s} train={c['train']:4d}  val={c['val']:3d}  test={c['test']:3d}")
    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    main()
