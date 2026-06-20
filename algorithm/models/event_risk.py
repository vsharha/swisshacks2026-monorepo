from __future__ import annotations

from typing import Any, Dict, Iterable

from .base import BaseRiskModel


class EventRiskModel(BaseRiskModel):
    """Risk score based on event intensity and severity."""

    def calculate(self, events: Iterable[Dict[str, Any]]) -> float:
        items = list(events or [])
        if not items:
            return 0.0

        score = 0.0
        for event in items:
            severity = event.get("severity", 0)
            score += severity * 10
            if event.get("is_material"):
                score += 15
            if event.get("is_regulatory"):
                score += 10
        return self.clamp(score / max(1, len(items)) * 2)
