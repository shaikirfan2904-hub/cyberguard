"""Evaluate the live model on its deterministic held-out data and smoke cases."""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import train_test_split

from config import Config
from detection_engine import predict_aggression
from train_model import DATA_FILE, RANDOM_STATE, TEST_SIZE, load_data


ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "model"
SMOKE_CASES = [
    ("safe_greeting", "Good morning, mate. Hope your day is going well.", False),
    ("safe_frustration", "I hate when the train is late; it ruins my morning.", False),
    ("safe_disagreement", "I disagree with your point, but I respect your view.", False),
    ("safe_defending_someone", "Don't tell her to shut up; let her finish.", False),
    ("safe_discussion", "The word idiot appears in the dictionary.", False),
    ("abuse_direct", "You are a complete idiot.", True),
    ("abuse_british_insult", "You're a right prat, mate.", True),
    ("abuse_threat", "I will find you and hurt you.", True),
    ("abuse_self_harm", "Kill yourself, nobody wants you here.", True),
    ("obfuscated_punctuation", "F.u.c.k off, you useless idiot.", True),
    ("obfuscated_repeated_letters", "You are such an idiooot.", True),
    ("quoted_abuse_context", "He told me 'fuck you', but I walked away.", False),
]


def model_probability(model, vectorizer, texts: list[str]) -> np.ndarray:
    matrix = model.predict_proba(vectorizer.transform(texts))
    classes = list(model.classes_)
    index = next(
        (i for i, label in enumerate(classes) if str(label).strip().upper() in {"1", "AGGRESSIVE"}),
        None,
    )
    if index is None:
        raise ValueError("The loaded model has no aggressive class.")
    return matrix[:, index]


def metrics(labels: np.ndarray, predicted: np.ndarray) -> dict:
    precision, recall, f1, _ = precision_recall_fscore_support(
        labels, predicted, average="binary", pos_label=1, zero_division=0
    )
    tn, fp, fn, tp = confusion_matrix(labels, predicted, labels=[0, 1]).ravel()
    return {
        "accuracy": round(float(accuracy_score(labels, predicted)), 4),
        "aggressive_precision": round(float(precision), 4),
        "aggressive_recall": round(float(recall), 4),
        "aggressive_f1": round(float(f1), 4),
        "safe_specificity": round(float(tn / max(1, tn + fp)), 4),
        "safe_false_positive_rate": round(float(fp / max(1, tn + fp)), 4),
        "true_negative": int(tn),
        "false_positive": int(fp),
        "false_negative": int(fn),
        "true_positive": int(tp),
    }


def main() -> None:
    texts, labels, _ = load_data(DATA_FILE)
    _, test_indices = train_test_split(
        np.arange(len(labels)),
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=labels,
    )
    test_texts = [texts[index] for index in test_indices]
    test_labels = labels[test_indices]

    live_model = joblib.load(MODEL_DIR / "model.pkl")
    live_vectorizer = joblib.load(MODEL_DIR / "vectorizer.pkl")
    metadata = json.loads((MODEL_DIR / "model_metadata.json").read_text(encoding="utf-8"))
    threshold = float(Config.AGGRESSION_THRESHOLD)
    live_probabilities = model_probability(live_model, live_vectorizer, test_texts)

    print(f"Reproducible holdout: {len(test_labels):,} messages; threshold={threshold:.3f}")
    live_metrics = metrics(test_labels, live_probabilities >= threshold)
    print("Live model:", json.dumps(live_metrics))
    stored = metadata["test_metrics"]
    report_matches = all(
        live_metrics[actual] == stored[recorded]
        for actual, recorded in (
            ("accuracy", "accuracy"),
            ("aggressive_precision", "precision"),
            ("aggressive_recall", "recall"),
            ("aggressive_f1", "f1"),
        )
    ) and [
        [live_metrics["true_negative"], live_metrics["false_positive"]],
        [live_metrics["false_negative"], live_metrics["true_positive"]],
    ] == stored["confusion_matrix"]
    print("Recorded training report matches:", report_matches)

    backup_dirs = sorted((MODEL_DIR / "backups").glob("*"))
    if backup_dirs:
        previous_dir = backup_dirs[-1]
        previous_model = joblib.load(previous_dir / "model.pkl")
        previous_vectorizer = joblib.load(previous_dir / "vectorizer.pkl")
        previous_metadata = json.loads((previous_dir / "model_metadata.json").read_text(encoding="utf-8"))
        previous_probabilities = model_probability(previous_model, previous_vectorizer, test_texts)
        previous_threshold = float(previous_metadata.get("threshold", 0.65))
        print("Previous model:", json.dumps(metrics(test_labels, previous_probabilities >= previous_threshold)))

    print("Threshold sensitivity (diagnostic only; threshold was selected on validation data):")
    for value in (0.85, 0.90, threshold, 0.93, 0.95):
        if value in [0.85, 0.90, 0.93, 0.95] or abs(value - threshold) < 1e-9:
            print(f"  {value:.3f}: {json.dumps(metrics(test_labels, live_probabilities >= value))}")

    print("\nHand-written smoke cases (qualitative, not a benchmark):")
    failures = 0
    for case_id, text, expected_block in SMOKE_CASES:
        result = predict_aggression(text, threshold=threshold)
        aggressive_probability = float(model_probability(live_model, live_vectorizer, [text])[0])
        passed = bool(result["blocked"]) == expected_block
        failures += int(not passed)
        print(
            f"  {'PASS' if passed else 'REVIEW'} {case_id}: expected="
            f"{'block' if expected_block else 'allow'}, got="
            f"{'block' if result['blocked'] else 'allow'} ({result.get('method')}, "
            f"aggressive_probability={aggressive_probability:.3f})"
        )
    print(f"Smoke cases needing review: {failures}/{len(SMOKE_CASES)}")


if __name__ == "__main__":
    main()
