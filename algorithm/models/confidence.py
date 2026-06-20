from __future__ import annotations

from typing import Any, Dict


class ConfidenceEngine:
    """Calculates confidence from evidence quality."""

    def calculate(self, evidence: Dict[str, Any] | None = None) -> float:
        evidence = evidence or {}
        sources = int(evidence.get("sources", 0))
        recency = int(evidence.get("recency_score", 0))
        consistency = int(evidence.get("consistency_score", 0))
        citations = int(evidence.get("citations", 0))

        score = min(100.0, (sources * 10) + recency + consistency + (citations * 5))
        return round(score, 2)
