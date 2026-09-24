"""Dataset label vocabulary shared by the inference API and the evaluator.

The classifier is trained on combined labels such as ``fresh_apples`` and
``rotten_tomato``. Those carry two pieces of information at once — the food
identity and its freshness — so every consumer needs the same split rules.
"""

from __future__ import annotations

SPOILED_WORDS = ("rotten", "spoiled", "stale", "bad")
FRESH_WORDS = ("fresh", "good", "ripe")

# Prefixes stripped from a combined label to recover the bare food name.
FRESHNESS_PREFIXES = ("fresh", "rotten", "spoiled", "ripe", "good", "bad")

# Label the identity model uses for anything that is not one of the app's foods.
OTHER_LABEL = "other"

# Dataset spellings normalised to the names used in the mobile food catalog.
FOOD_ALIASES = {
    "apples": "apple",
    "oranges": "orange",
    "potatoes": "potato",
    "patato": "potato",
    "patatoes": "potato",
    "tamto": "tomato",
    "tomatoes": "tomato",
    "bittergourd": "bitter gourd",
    "bittergroud": "bitter gourd",
    "bitter gourd": "bitter gourd",
    "capsicum": "capsicum",
    "cucumber": "cucumber",
    "okra": "okra",
    "banana": "banana",
    "bananas": "banana",
    "mango": "mango",
    "mangoes": "mango",
    "mangos": "mango",
    "papaya": "papaya",
    "papayas": "papaya",
    "eggplant": "eggplant",
    "eggplants": "eggplant",
    "brinjal": "eggplant",
    "talong": "eggplant",
}


def freshness_from_label(label: str) -> str:
    """Return ``fresh``, ``spoiled`` or ``unknown`` for a dataset label."""
    value = str(label).lower()
    if any(word in value for word in SPOILED_WORDS):
        return "spoiled"
    if any(word in value for word in FRESH_WORDS):
        return "fresh"
    return "unknown"


def food_name_from_label(label: str) -> str | None:
    """Strip the freshness prefix and normalise the remaining food name.

    ``fresh_apples`` and ``freshapples`` both become ``apple``. Returns ``None``
    when nothing recognisable is left, or for the ``other`` class, so callers can
    fall back to a hint.
    """
    value = str(label).lower().replace("_", " ").replace("-", " ").strip()
    for prefix in FRESHNESS_PREFIXES:
        if value.startswith(prefix):
            value = value[len(prefix) :].strip()
            break
    value = " ".join(value.split())
    if not value or value in (OTHER_LABEL, "unknown"):
        return None
    return FOOD_ALIASES.get(value, value)


def split_label(label: str) -> tuple[str | None, str]:
    """Split a combined dataset label into ``(food_name, freshness)``."""
    return food_name_from_label(label), freshness_from_label(label)
