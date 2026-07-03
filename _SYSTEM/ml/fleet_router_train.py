#!/usr/bin/env python3
"""
fleet_router_train.py — Python MLP sidecar for fleet router training.

Reads the prediction ledger, extracts the same 12 features as the JS MLP,
trains a logistic regression + small numpy MLP, computes held-out Brier,
and outputs a comparison JSON.

Advisory only — Node control plane keeps authority. This script does NOT
write weights; it reports Brier for comparison against the JS MLP.

Usage:
    python3 _SYSTEM/ml/fleet_router_train.py --ledger _SYSTEM/state/prediction-ledger.jsonl
    python3 _SYSTEM/ml/fleet_router_train.py --ledger _SYSTEM/state/prediction-ledger.jsonl --epochs 200 --lr 0.01
"""

import argparse
import json
import math
import sys
import os
from pathlib import Path

try:
    import numpy as np
except ImportError:
    print(json.dumps({"ok": False, "error": "numpy not available — pip install numpy"}))
    sys.exit(1)

NUM_FEATURES = 12
HIDDEN_SIZE = 8
EVAL_FRACTION = 0.2
EVAL_SPLIT_MIN = 5


def sigmoid(x):
    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    z = math.exp(x)
    return z / (1.0 + z)


def sigmoid_vec(x):
    return 1.0 / (1.0 + np.exp(-np.clip(x, -500, 500)))


def read_ledger(path):
    """Read JSONL ledger and extract prediction + outcome entries."""
    preds = {}
    outcomes = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if entry.get("type") == "prediction" and "id" in entry:
                preds[entry["id"]] = entry
            elif entry.get("type") == "outcome" and "predictionId" in entry:
                outcomes.append(entry)
    return preds, outcomes


def reconstruct_features(subject):
    """Reconstruct 12 features from subject string (same heuristic as JS)."""
    role = "engineer"
    for r in ["adjudicator", "architect", "kernelsmith", "deliberator", "oracle",
              "scout", "artificer", "chronicler", "envoy", "synthesist", "mechanic",
              "sentinel", "calibrator", "helmsman", "steward", "evolver", "ideator",
              "quartermaster", "archivist"]:
        if r in subject.lower():
            role = r
            break
    return [
        0.82 if role == "adjudicator" else 0.55,  # complexity
        0.5,  # blastRadius
        0.7,  # capabilityMatch
        0.5,  # historicalSuccess
        0.38 if "glm" in subject.lower() else 0.25,  # quotaPressure
        0.7,  # evidenceDecidability
        5.0 if role in ("architect", "adjudicator", "kernelsmith") else 3.0,  # expectedToolTurns
        0.0,  # recursionDepth
        1.0 if role in ("adjudicator", "architect", "deliberator", "oracle") else 0.0,  # isHeavyReasoning
        1.0 if role in ("scout", "artificer") else 0.0,  # isBulkCensus
        1.0 if role == "sentinel" else 0.0,  # isSecurityAudit
        0.0,  # isNativeOnly
    ]


def extract_examples(preds, outcomes):
    """Extract (features, outcome) pairs from matched predictions + outcomes."""
    examples = []
    for out in outcomes:
        pred = preds.get(out["predictionId"])
        if not pred:
            continue
        feats = pred.get("features")
        if not feats or not isinstance(feats, list) or len(feats) == 0:
            feats = reconstruct_features(pred.get("subject", ""))
        if len(feats) < NUM_FEATURES:
            feats = feats + [0.0] * (NUM_FEATURES - len(feats))
        feats = feats[:NUM_FEATURES]

        obs = out.get("observedEffects", [])
        success = 1 if any(e.get("target") == "success" and float(e.get("effect", 0)) > 0.5 for e in obs) else 0
        quality_obs = next((e for e in obs if e.get("target") == "quality"), None)
        quality = max(0.0, min(1.0, float(quality_obs["effect"]))) if quality_obs else (0.82 if success else 0.18)

        examples.append({
            "features": feats,
            "success": success,
            "quality": quality,
            "target": success * quality,
            "subject": pred.get("subject", ""),
            "id": pred.get("id", ""),
            "ts": pred.get("ts", 0),
        })
    return examples


def train_logistic(X_train, y_train, epochs=200, lr=0.01):
    """Simple logistic regression with numpy."""
    n, d = X_train.shape
    w = np.zeros(d)
    b = 0.0
    for _ in range(epochs):
        preds = sigmoid_vec(X_train @ w + b)
        grad_w = X_train.T @ (preds - y_train) / n
        grad_b = np.mean(preds - y_train)
        w -= lr * grad_w
        b -= lr * grad_b
    return w, b


def train_mlp(X_train, y_train, epochs=200, lr=0.01, hidden=HIDDEN_SIZE):
    """Small numpy MLP: 12 → 8 → 1 with ReLU + sigmoid."""
    n, d = X_train.shape
    # Xavier init
    rng = np.random.default_rng(0xC0FFEE)
    W1 = rng.standard_normal((d, hidden)) * math.sqrt(2.0 / d)
    b1 = np.zeros(hidden)
    W2 = rng.standard_normal(hidden) * math.sqrt(2.0 / hidden)
    b2 = 0.0

    for epoch in range(epochs):
        # Forward
        Z1 = X_train @ W1 + b1
        H = np.maximum(0, Z1)  # ReLU
        Z2 = H @ W2 + b2
        preds = sigmoid_vec(Z2)

        # Backward
        dZ2 = (preds - y_train) / n
        dW2 = H.T @ dZ2
        db2 = dZ2.sum()
        dH = np.outer(dZ2, W2) * (Z1 > 0)
        dW1 = X_train.T @ dH
        db1 = dH.sum(axis=0)

        # Update
        lr_e = lr / (1 + epoch * 0.5)
        W1 -= lr_e * dW1
        b1 -= lr_e * db1
        W2 -= lr_e * dW2
        b2 -= lr_e * db2

    return {"W1": W1, "b1": b1, "W2": W2, "b2": b2}


def predict_logistic(w, b, X):
    return sigmoid_vec(X @ w + b)


def predict_mlp(params, X):
    Z1 = X @ params["W1"] + params["b1"]
    H = np.maximum(0, Z1)
    Z2 = H @ params["W2"] + params["b2"]
    return sigmoid_vec(Z2)


def brier_score(preds, targets):
    return float(np.mean((preds - targets) ** 2))


def main():
    parser = argparse.ArgumentParser(description="Python MLP fleet router training sidecar")
    parser.add_argument("--ledger", default="_SYSTEM/state/prediction-ledger.jsonl")
    parser.add_argument("--epochs", type=int, default=200)
    parser.add_argument("--lr", type=float, default=0.01)
    parser.add_argument("--eval-fraction", type=float, default=EVAL_FRACTION)
    args = parser.parse_args()

    ledger_path = args.ledger
    if not os.path.isabs(ledger_path):
        repo_root = Path(__file__).resolve().parent.parent.parent
        ledger_path = str(repo_root / ledger_path)

    if not os.path.exists(ledger_path):
        print(json.dumps({"ok": False, "error": f"ledger not found: {ledger_path}"}))
        sys.exit(1)

    preds, outcomes = read_ledger(ledger_path)
    examples = extract_examples(preds, outcomes)

    if len(examples) < EVAL_SPLIT_MIN:
        print(json.dumps({
            "ok": True,
            "epochs": 0,
            "exampleCount": len(examples),
            "evalMeanBrier": None,
            "evalExampleCount": 0,
            "note": "Too few examples for held-out eval",
        }))
        return

    # Time-ordered 80/20 split (same as JS)
    examples.sort(key=lambda e: int(e.get("ts", 0)) if str(e.get("ts", "0")).isdigit() else 0)
    split_idx = int(len(examples) * (1 - args.eval_fraction))
    train_ex = examples[:split_idx]
    eval_ex = examples[split_idx:]

    X_train = np.array([e["features"] for e in train_ex])
    y_train = np.array([e["target"] for e in train_ex])
    X_eval = np.array([e["features"] for e in eval_ex])
    y_eval = np.array([e["target"] for e in eval_ex])

    # Train logistic
    w_log, b_log = train_logistic(X_train, y_train, args.epochs, args.lr)
    preds_log = predict_logistic(w_log, b_log, X_eval)
    brier_log = brier_score(preds_log, y_eval)

    # Train MLP
    mlp_params = train_mlp(X_train, y_train, args.epochs, args.lr)
    preds_mlp = predict_mlp(mlp_params, X_eval)
    brier_mlp = brier_score(preds_mlp, y_eval)

    # Feature importance (logistic weights)
    feature_names = [
        "complexity", "blastRadius", "capabilityMatch", "historicalSuccess",
        "quotaPressure", "evidenceDecidability", "expectedToolTurns", "recursionDepth",
        "isHeavyReasoning", "isBulkCensus", "isSecurityAudit", "isNativeOnly",
    ]
    importance = {
        feature_names[i]: float(w_log[i])
        for i in range(min(len(feature_names), len(w_log)))
    }

    result = {
        "ok": True,
        "provider": "python-numpy",
        "epochs": args.epochs,
        "lr": args.lr,
        "exampleCount": len(examples),
        "trainCount": len(train_ex),
        "evalExampleCount": len(eval_ex),
        "logistic": {
            "evalMeanBrier": brier_log,
        },
        "mlp": {
            "evalMeanBrier": brier_mlp,
            "hiddenSize": HIDDEN_SIZE,
        },
        "featureImportance": dict(sorted(importance.items(), key=lambda x: abs(x[1]), reverse=True)),
        "note": "Advisory only — Node JS MLP is the authority. Compare evalMeanBrier.",
    }

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
