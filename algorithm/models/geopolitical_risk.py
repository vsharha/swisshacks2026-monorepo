from __future__ import annotations

from typing import Any, Iterable

from .base import BaseRiskModel


class GeopoliticalModel(BaseRiskModel):
    """Risk score based on geopolitical exposure of countries involved."""

    def calculate(self, countries: Iterable[Any]) -> float:
        items = list(countries or [])
        if not items:
            return 0.0

        high_risk = {"sanctioned", "high_risk", "restricted", "risky"}
        score = 0.0
        for country in items:
            if isinstance(country, dict):
                risk = country.get("risk_level", 0)
                if country.get("name") in high_risk or country.get("is_high_risk"):
                    risk += 20
                score += float(risk)
            else:
                score += 5 if str(country).lower() in high_risk else 0
        return self.clamp(score)
