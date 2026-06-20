from __future__ import annotations

from typing import Any, Dict

from .base import BaseRiskModel


class RegulatoryModel(BaseRiskModel):
    """Risk score based on regulatory posture and compliance issues."""

    def calculate(self, company: Dict[str, Any]) -> float:
        profile = self.normalize_payload(company)
        score = 0.0
        score += 20 if profile.get("has_regulatory_actions", False) else 0
        score += 15 if profile.get("has_litigation", False) else 0
        score += 10 if profile.get("has_kyc_gap", False) else 0
        score += 5 * int(profile.get("regulatory_hits", 0))
        return self.clamp(score)
