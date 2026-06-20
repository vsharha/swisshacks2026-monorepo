from __future__ import annotations

from typing import Any, Iterable

from .base import BaseRiskModel


class BehavioralModel(BaseRiskModel):
    """Risk score based on behavioral signals over time."""

    def calculate(self, signals: Iterable[Any]) -> float:
        items = list(signals or [])
        if not items:
            return 0.0

        score = 0.0
        for signal in items:
            score += float(signal.get("score", 0)) if isinstance(signal, dict) else float(signal)

        return self.clamp(score / max(1, len(items)) * 10)
