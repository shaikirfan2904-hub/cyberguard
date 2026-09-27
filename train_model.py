"""Train and validate the CyberGuard text classifier.

The final test split is kept out of fitting and threshold selection. A candidate
replaces the live model only when it improves aggressive-message F1 and recall
without materially reducing precision.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import train_test_split
from sklearn.pipeline import FeatureUnion


ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "datasets" / "cleaned_dataset.csv"
MODEL_DIR = ROOT / "model"
MAX_VALIDATION_FALSE_POSITIVE_RATE = 0.05
TEST_SIZE = 0.20
RANDOM_STATE = 42


def load_data(path: Path) -> tuple[list[str], np.ndarray, dict[str, int]]:
    frame = pd.read_csv(path)
    if not {"text", "label"}.issubset(frame.columns):
        raise ValueError("Dataset must contain 'text' and 'label' columns.")

    frame = frame.dropna(subset=["text", "label"]).copy()
    frame["text"] = frame["text"].astype(str).str.strip()
    frame["label"] = pd.to_numeric(frame["label"], errors="coerce")
    frame = frame[(frame["text"] != "") & frame["label"].isin([0, 1])].copy()
    frame["label"] = frame["label"].astype(int)

    # Collapse case and whitespace duplicates. Conflicting labels are excluded
    # because they provide contradictory supervision for the same message.
    frame["_key"] = frame["text"].str.lower().str.replace(r"\s+", " ", regex=True)
    label_counts = frame.groupby("_key")["label"].nunique()
    conflicting = set(label_counts[label_counts > 1].index)
    frame = frame[~frame["_key"].isin(conflicting)]
    frame = frame.drop_duplicates("_key", keep="first")

    if frame["label"].nunique() != 2:
        raise ValueError("Training requires both safe (0) and aggressive (1) examples.")

    counts = {str(key): int(value) for key, value in frame["label"].value_counts().sort_index().items()}
    return frame["text"].tolist(), frame["label"].to_numpy(dtype=int), counts


def make_vectorizer() -> FeatureUnion:
    # Word features retain meaning and common phrases; character n-grams help
    # with misspellings, repeated letters, punctuation and deliberate evasion.
    return FeatureUnion(
        [
            (
                "word",
                TfidfVectorizer(
                    analyzer="word",
                    ngram_range=(1, 2),
                    min_df=2,
                    max_features=120_000,
                    sublinear_tf=True,
                    strip_accents="unicode",
                    max_df=0.98,
                ),
            ),
            (
                "char",
                TfidfVectorizer(
                    analyzer="char_wb",
                    ngram_range=(3, 5),
                    min_df=2,
                    max_features=180_000,
                    sublinear_tf=True,
                    max_df=0.98,
                ),
            ),
        ],
        transformer_weights={"word": 1.0, "char": 1.0},
        n_jobs=1,
    )


def fit_classifier(features, labels: np.ndarray) -> LogisticRegression:
    classifier = LogisticRegression(
        C=2.0,
        class_weight="balanced",
        max_iter=1000,
        solver="liblinear",
        random_state=RANDOM_STATE,
    )
    classifier.fit(features, labels)
    return classifier


def score_at_threshold(labels: np.ndarray, probabilities: np.ndarray, threshold: float) -> dict:
    predicted = probabilities >= threshold
    precision, recall, f1, _ = precision_recall_fscore_support(
        labels, predicted, average="binary", pos_label=1, zero_division=0
    )
    matrix = confusion_matrix(labels, predicted, labels=[0, 1])
    true_negative, false_positive, _, _ = matrix.ravel()
    return {
        "threshold": round(float(threshold), 4),
        "accuracy": round(float(accuracy_score(labels, predicted)), 4),
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "f1": round(float(f1), 4),
        "false_positive_rate": round(float(false_positive / max(1, true_negative + false_positive)), 4),
        "confusion_matrix": matrix.tolist(),
    }


def choose_threshold(labels: np.ndarray, probabilities: np.ndarray) -> tuple[float, dict]:
    candidates = np.arange(0.05, 0.951, 0.005)
    scored = [(float(value), score_at_threshold(labels, probabilities, value)) for value in candidates]
    eligible = [
        item for item in scored
        if item[1]["false_positive_rate"] <= MAX_VALIDATION_FALSE_POSITIVE_RATE
    ]
    if eligible:
        threshold, metrics = max(eligible, key=lambda item: (item[1]["recall"], item[1]["f1"]))
    else:
        threshold, metrics = max(scored, key=lambda item: item[1]["f1"])
    return threshold, metrics


def existing_model_metrics(texts: list[str], labels: np.ndarray) -> tuple[float, dict | None]:
    model_path = MODEL_DIR / "model.pkl"
    vectorizer_path = MODEL_DIR / "vectorizer.pkl"
    if not model_path.exists() or not vectorizer_path.exists():
        return 0.65, None

    current = joblib.load(model_path)
    current_vectorizer = joblib.load(vectorizer_path)
    probabilities_by_class = current.predict_proba(current_vectorizer.transform(texts))
    classes = list(current.classes_)
    aggressive_index = next(
        (index for index, value in enumerate(classes) if str(value).upper() in {"1", "AGGRESSIVE"}),
        None,
    )
    if aggressive_index is None:
        raise ValueError("Current classifier does not expose an aggressive class probability.")
    probabilities = probabilities_by_class[:, aggressive_index]

    metadata_path = MODEL_DIR / "model_metadata.json"
    current_threshold = 0.65
    if metadata_path.exists():
        try:
            current_threshold = float(json.loads(metadata_path.read_text(encoding="utf-8")).get("threshold", 0.65))
        except (ValueError, TypeError, json.JSONDecodeError):
            pass
    return current_threshold, score_at_threshold(labels, probabilities, current_threshold)


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def update_local_threshold(old_threshold: float, new_threshold: float) -> None:
    """Keep a matching local .env threshold aligned with the promoted model."""
    env_path = ROOT / ".env"
    if not env_path.exists():
        return

    lines = env_path.read_text(encoding="utf-8").splitlines(keepends=True)
    changed = False
    for index, line in enumerate(lines):
        match = re.match(r"^(\s*AGGRESSION_THRESHOLD\s*=\s*)([^\s#]+)(.*)$", line.rstrip("\r\n"))
        if not match:
            continue
        try:
            configured_threshold = float(match.group(2).strip("\"'"))
        except ValueError:
            continue
        if abs(configured_threshold - old_threshold) < 1e-9:
            ending = "\r\n" if line.endswith("\r\n") else "\n" if line.endswith("\n") else ""
            lines[index] = f"{match.group(1)}{new_threshold:g}{match.group(3)}{ending}"
            changed = True
        break

    if changed:
        env_path.write_text("".join(lines), encoding="utf-8")
        print("Updated the local .env threshold to match the promoted model.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=DATA_FILE, help="CSV with text,label columns")
    parser.add_argument(
        "--promote-if-better",
        action="store_true",
        help="Back up and replace the live model only if held-out metrics pass the safety gate.",
    )
    args = parser.parse_args()

    texts, labels, class_counts = load_data(args.data)
    all_indices = np.arange(len(labels))
    train_indices, test_indices = train_test_split(
        all_indices,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=labels,
    )
    fit_indices, validation_indices = train_test_split(
        train_indices,
        test_size=0.20,
        random_state=RANDOM_STATE,
        stratify=labels[train_indices],
    )

    train_texts = [texts[index] for index in fit_indices]
    validation_texts = [texts[index] for index in validation_indices]
    test_texts = [texts[index] for index in test_indices]

    print(f"Dataset: {len(texts):,} unique, non-conflicting examples; labels={class_counts}")
    print(f"Split: fit={len(fit_indices):,}, validation={len(validation_indices):,}, test={len(test_indices):,}")

    # Tune the block threshold on validation examples only.
    validation_vectorizer = make_vectorizer()
    validation_features = validation_vectorizer.fit_transform(train_texts)
    validation_classifier = fit_classifier(validation_features, labels[fit_indices])
    validation_probabilities = validation_classifier.predict_proba(
        validation_vectorizer.transform(validation_texts)
    )[:, 1]
    threshold, validation_metrics = choose_threshold(labels[validation_indices], validation_probabilities)

    # Refit on the complete training partition; the final test partition remains unseen.
    final_vectorizer = make_vectorizer()
    final_features = final_vectorizer.fit_transform([texts[index] for index in train_indices])
    final_classifier = fit_classifier(final_features, labels[train_indices])
    test_features = final_vectorizer.transform(test_texts)
    test_probabilities = final_classifier.predict_proba(test_features)[:, 1]
    candidate_metrics = score_at_threshold(labels[test_indices], test_probabilities, threshold)

    baseline_threshold, baseline_metrics = existing_model_metrics(test_texts, labels[test_indices])
    print("\nHeld-out aggressive-message metrics (class 1):")
    if baseline_metrics is None:
        print("  current model: unavailable")
    else:
        print(f"  current threshold={baseline_threshold:.3f}: {baseline_metrics}")
    print(f"  candidate threshold={threshold:.3f}: {candidate_metrics}")
    print(f"  validation threshold metrics: {validation_metrics}")

    try:
        dataset_name = str(args.data.resolve().relative_to(ROOT))
    except ValueError:
        dataset_name = str(args.data.resolve())

    candidate_dir = MODEL_DIR / "candidate"
    candidate_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(final_classifier, candidate_dir / "model.pkl", compress=3)
    joblib.dump(final_vectorizer, candidate_dir / "vectorizer.pkl", compress=3)
    metadata = {
        "model_name": "LogisticRegression(word+char TF-IDF, class_weight=balanced)",
        "dataset": dataset_name,
        "dataset_size": len(texts),
        "class_counts": class_counts,
        "train_size": len(train_indices),
        "validation_size": len(validation_indices),
        "test_size": len(test_indices),
        "random_state": RANDOM_STATE,
        "training_date": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "threshold": round(threshold, 4),
        "threshold_selection": (
            "maximum validation recall with safe-message false-positive rate <= "
            f"{MAX_VALIDATION_FALSE_POSITIVE_RATE:.2f}"
        ),
        "validation_metrics": validation_metrics,
        "test_metrics": candidate_metrics,
        "baseline_test_metrics": baseline_metrics,
        "maximum_test_false_positive_rate_for_promotion": (
            min(1.0, baseline_metrics["false_positive_rate"] + 0.01)
            if baseline_metrics else MAX_VALIDATION_FALSE_POSITIVE_RATE
        ),
        "feature_count": int(final_features.shape[1]),
        "labels": {"0": "SAFE", "1": "AGGRESSIVE"},
    }
    write_json(candidate_dir / "model_metadata.json", metadata)

    precision_floor = max(0.95, baseline_metrics["precision"] - 0.01) if baseline_metrics else 0.95
    false_positive_ceiling = (
        min(1.0, baseline_metrics["false_positive_rate"] + 0.01)
        if baseline_metrics else MAX_VALIDATION_FALSE_POSITIVE_RATE
    )
    promote = (
        candidate_metrics["precision"] >= precision_floor
        and candidate_metrics["false_positive_rate"] <= false_positive_ceiling
        and (
            baseline_metrics is None
            or (
                candidate_metrics["recall"] >= baseline_metrics["recall"]
                and candidate_metrics["f1"] > baseline_metrics["f1"]
            )
        )
    )
    print(
        f"\nPromotion gate: {'PASS' if promote else 'FAIL'} "
        f"(precision floor {precision_floor:.4f}; false-positive ceiling {false_positive_ceiling:.4f})"
    )
    print(f"Candidate artifacts: {candidate_dir}")

    if not args.promote_if_better:
        print("Live model unchanged. Re-run with --promote-if-better to promote a passing candidate.")
        return
    if not promote:
        print("Live model unchanged because the candidate did not pass the promotion gate.")
        return

    backup_dir = MODEL_DIR / "backups" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_dir.mkdir(parents=True, exist_ok=False)
    for filename in ("model.pkl", "vectorizer.pkl", "model_metadata.json"):
        live = MODEL_DIR / filename
        if live.exists():
            shutil.copy2(live, backup_dir / filename)
    for filename in ("model.pkl", "vectorizer.pkl", "model_metadata.json"):
        shutil.copy2(candidate_dir / filename, MODEL_DIR / filename)
    update_local_threshold(baseline_threshold, threshold)
    print(f"Promoted candidate; previous live artifacts backed up to {backup_dir}.")


if __name__ == "__main__":
    main()
