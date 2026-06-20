from __future__ import annotations

from typing import Any, Dict


class BaseRiskModel:
    """Shared helpers for model implementations."""

    @staticmethod
    def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
        return max(low, min(high, value))

    @staticmethod
    def score_from_count(count: int, *, max_count: int = 10) -> float:
        return BaseRiskModel.clamp((count / max_count) * 100)

    @staticmethod
    def normalize_payload(payload: Any) -> Dict[str, Any]:
        if isinstance(payload, dict):
            return payload
        return {"value": payload}
