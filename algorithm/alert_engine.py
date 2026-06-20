from __future__ import annotations

from typing import Any, Dict

from .config import RISK_CONFIG


class AlertEngine:
    """Evaluate whether a score delta justifies sending an alert."""

    def __init__(self) -> None:
        self.alert_delta = RISK_CONFIG["alert_delta"]

    def evaluate(
        self,
        final_score: float,
        previous_score: float | None = None,
        confidence: float | None = None,
    ) -> Dict[str, Any]:
        previous_score = previous_score or 0.0
        confidence = confidence or 0.0
        delta = final_score - previous_score
        should_alert = delta >= self.alert_delta or final_score >= 75

        return {
            "should_alert": should_alert,
            "delta": round(delta, 2),
            "confidence": round(confidence, 2),
            "reason": (
                "score increased beyond threshold"
                if should_alert and delta >= self.alert_delta
                else "high risk score"
                if final_score >= 75
                else "no alert triggered"
            ),
        }
