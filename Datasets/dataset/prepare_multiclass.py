import os
import shutil
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent
SOURCE_TRAIN = PROJECT_ROOT / "Train"
SOURCE_TEST = PROJECT_ROOT / "Test"
OUTPUT_ROOT = PROJECT_ROOT / ".training" / "food_multiclass"


ALIASES = {
    "patato": "potato",
    "tamto": "tomato",
    "bittergroud": "bittergourd",
}


def normalize_class(folder_name):
    value = folder_name.lower()
    freshness = "fresh" if value.startswith("fresh") else "rotten"
    food = value[len(freshness):]
    return f"{freshness}_{ALIASES.get(food, food)}"


def link_images(source_root, split):
    linked = 0
    for class_dir in sorted(source_root.iterdir()):
        if not class_dir.is_dir() or not class_dir.name.lower().startswith(("fresh", "rotten")):
            continue
        destination = OUTPUT_ROOT / split / normalize_class(class_dir.name)
        destination.mkdir(parents=True, exist_ok=True)
        for image in class_dir.iterdir():
            if not image.is_file():
                continue
            target = destination / image.name
            if target.exists():
                continue
            try:
                os.link(image, target)
            except OSError:
                shutil.copy2(image, target)
            linked += 1
    return linked


def ensure_class_directories():
    train_classes = {
        normalize_class(path.name)
        for path in SOURCE_TRAIN.iterdir()
        if path.is_dir() and path.name.lower().startswith(("fresh", "rotten"))
    }
    for class_name in train_classes:
        (OUTPUT_ROOT / "val" / class_name).mkdir(parents=True, exist_ok=True)


def main():
    if OUTPUT_ROOT.exists():
        shutil.rmtree(OUTPUT_ROOT)
    train_count = link_images(SOURCE_TRAIN, "train")
    val_count = link_images(SOURCE_TEST, "val")
    ensure_class_directories()
    print(f"Prepared {train_count} training images and {val_count} validation images")
    print(f"Dataset root: {OUTPUT_ROOT}")


if __name__ == "__main__":
    main()
