from __future__ import annotations

from typing import Any, Dict

from .base import BaseRiskModel


class EntityRiskModel(BaseRiskModel):
    """Risk score based on entity-level baseline attributes."""

    def calculate(self, company: Dict[str, Any]) -> float:
        profile = self.normalize_payload(company)

        base = 0.0
        base += profile.get("risk_score", 0)
        base += 15 if profile.get("is_high_risk", False) else 0
        base += 10 if profile.get("has_adverse_media", False) else 0
        base += 8 if profile.get("is_shell_company", False) else 0
        base += 5 if profile.get("is_politically_exposed", False) else 0
        base += min(20, int(profile.get("sanctions_hits", 0)) * 5)

        return self.clamp(base)
