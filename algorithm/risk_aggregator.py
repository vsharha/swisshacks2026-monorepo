from __future__ import annotations

from typing import Any, Dict

from .config import RISK_CONFIG


class RiskAggregator:
    """Aggregates component scores into a final risk number."""

    def __init__(self) -> None:
        self.weights = RISK_CONFIG["weights"]

    def aggregate(self, scores: Dict[str, float]) -> float:
        total = 0.0
        for key, score in scores.items():
            total += float(score) * self.weights.get(key, 0.0)
        return round(total, 2)
