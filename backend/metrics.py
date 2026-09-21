"""Classification metrics computed from a confusion matrix.

Implemented with numpy so the backend keeps a small dependency set. The
definitions match scikit-learn's ``classification_report``:

    precision_c = TP_c / (TP_c + FP_c)
    recall_c    = TP_c / (TP_c + FN_c)
    f1_c        = 2 * precision_c * recall_c / (precision_c + recall_c)
    accuracy    = sum(TP) / total

``macro`` averages the per-class scores with equal weight; ``weighted``
averages them by support, which matters here because the food classes are far
from balanced. Division by zero yields 0.0, as scikit-learn does with
``zero_division=0``.
"""

from __future__ import annotations

from typing import Any, Sequence

import numpy as np


def confusion_matrix(y_true: Sequence[int], y_pred: Sequence[int], num_classes: int) -> np.ndarray:
    """Rows are the true class, columns are the predicted class."""
    matrix = np.zeros((num_classes, num_classes), dtype=np.int64)
    for actual, predicted in zip(y_true, y_pred):
        matrix[int(actual), int(predicted)] += 1
    return matrix


def classification_report(
    y_true: Sequence[int],
    y_pred: Sequence[int],
    class_names: Sequence[str],
) -> dict[str, Any]:
    """Full accuracy / precision / recall / F1 report for one task."""
    num_classes = len(class_names)
    matrix = confusion_matrix(y_true, y_pred, num_classes)

    true_positive = np.diag(matrix).astype(np.float64)
    predicted_total = matrix.sum(axis=0).astype(np.float64)  # TP + FP
    actual_total = matrix.sum(axis=1).astype(np.float64)  # TP + FN = support
    total = float(matrix.sum())

    precision = _safe_divide(true_positive, predicted_total)
    recall = _safe_divide(true_positive, actual_total)
    f1 = _safe_divide(2 * precision * recall, precision + recall)

    accuracy = float(true_positive.sum() / total) if total else 0.0
    support_weights = actual_total / total if total else np.zeros_like(actual_total)

    # Classes with no samples would drag a macro average toward zero.
    present = actual_total > 0
    macro = {
        "precision": _mean(precision[present]),
        "recall": _mean(recall[present]),
        "f1": _mean(f1[present]),
    }
    weighted = {
        "precision": float(np.dot(precision, support_weights)),
        "recall": float(np.dot(recall, support_weights)),
        "f1": float(np.dot(f1, support_weights)),
    }

    per_class = [
        {
            "label": class_names[i],
            "precision": round(float(precision[i]), 4),
            "recall": round(float(recall[i]), 4),
            "f1": round(float(f1[i]), 4),
            "support": int(actual_total[i]),
        }
        for i in range(num_classes)
    ]

    return {
        "accuracy": round(accuracy, 4),
        "macro": {key: round(value, 4) for key, value in macro.items()},
        "weighted": {key: round(value, 4) for key, value in weighted.items()},
        "perClass": per_class,
        "confusionMatrix": matrix.tolist(),
        "classNames": list(class_names),
        "samples": int(total),
        "correct": int(true_positive.sum()),
    }


def binary_report(
    y_true: Sequence[int],
    y_pred: Sequence[int],
    class_names: Sequence[str],
    positive_index: int = 1,
) -> dict[str, Any]:
    """Binary report that also exposes the positive class's own scores.

    For freshness the positive class is ``rotten``: recall on that class is the
    number that matters for food safety, since a missed rotten item is the
    costly error.
    """
    report = classification_report(y_true, y_pred, class_names)
    positive = report["perClass"][positive_index]
    matrix = np.array(report["confusionMatrix"], dtype=np.int64)

    negative_index = 1 - positive_index
    report["binary"] = {
        "positiveClass": class_names[positive_index],
        "precision": positive["precision"],
        "recall": positive["recall"],
        "f1": positive["f1"],
        "truePositive": int(matrix[positive_index, positive_index]),
        "falsePositive": int(matrix[negative_index, positive_index]),
        "falseNegative": int(matrix[positive_index, negative_index]),
        "trueNegative": int(matrix[negative_index, negative_index]),
    }
    return report


def _safe_divide(numerator: np.ndarray, denominator: np.ndarray) -> np.ndarray:
    return np.divide(
        numerator,
        denominator,
        out=np.zeros_like(numerator, dtype=np.float64),
        where=denominator > 0,
    )


def _mean(values: np.ndarray) -> float:
    return float(values.mean()) if values.size else 0.0
