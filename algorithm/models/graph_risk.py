from __future__ import annotations

from typing import Any, Dict

from .base import BaseRiskModel


class GraphRiskModel(BaseRiskModel):
    """Risk score based on graph relationships and network topology."""

    def __init__(self, graph: Dict[str, Any] | None = None):
        self.graph = graph or {}

    def calculate(self, entity_id: Any) -> float:
        graph = self.normalize_payload(self.graph)
        node = graph.get("nodes", {}).get(str(entity_id), {})
        neighbors = graph.get("neighbors", {}).get(str(entity_id), [])

        score = 0.0
        score += node.get("risk_score", 0)
        score += min(40, len(neighbors) * 5)
        score += 10 if node.get("is_shadow_owner", False) else 0
        score += 15 if node.get("has_high_risk_neighbors", False) else 0

        return self.clamp(score)
