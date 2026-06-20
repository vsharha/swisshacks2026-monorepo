from __future__ import annotations

from typing import Any, Dict, Iterable


class KnowledgeGraphServer:
    """Builds a graph view of entities and their relationships."""

    @staticmethod
    def build(companies: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
        nodes: Dict[str, Any] = {}
        neighbors: Dict[str, list[str]] = {}

        for company in companies:
            entity_id = str(company.get("id"))
            nodes[entity_id] = {
                "name": company.get("name", entity_id),
                "risk_score": company.get("risk_score", 0),
                "is_shadow_owner": company.get("is_shadow_owner", False),
                "has_high_risk_neighbors": bool(company.get("related_entities")),
            }
            neighbors[entity_id] = [
                str(item) for item in company.get("related_entities", [])
            ]

        return {
            "nodes": nodes,
            "neighbors": neighbors,
        }
