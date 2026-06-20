from __future__ import annotations

from typing import Any, Dict, Iterable

from .config import RISK_CONFIG
from .models import (
    BehavioralModel,
    ConfidenceEngine,
    EntityRiskModel,
    EventRiskModel,
    GeopoliticalModel,
    GraphRiskModel,
    RegulatoryModel,
)


class RiskOrchestrator:
    """Coordinate per-domain risk models and aggregate into a final score."""

    def __init__(self) -> None:
        self.weights = RISK_CONFIG["weights"]
        self.criteria_weights = RISK_CONFIG["criteria_weights"]
        self.thresholds = RISK_CONFIG["risk_thresholds"]
        self.confidence_engine = ConfidenceEngine()

    def calculate_company_risk(
        self,
        company: Dict[str, Any],
        graph: Dict[str, Any] | None,
        events: Iterable[Dict[str, Any]],
        signals: Iterable[Any],
    ) -> Dict[str, Any]:
        events_list = list(events or [])
        signals_list = list(signals or [])

        entity_score = EntityRiskModel().calculate(company)
        graph_score = GraphRiskModel(graph).calculate(company.get("id"))
        behavior_score = BehavioralModel().calculate(signals_list)
        event_score = EventRiskModel().calculate(events_list)
        geopolitical_score = GeopoliticalModel().calculate(company.get("countries", []))
        regulatory_score = RegulatoryModel().calculate(company)

        component_scores = {
            "entity": entity_score,
            "graph": graph_score,
            "behavior": behavior_score,
            "event": event_score,
            "regulatory": regulatory_score,
            "geopolitical": geopolitical_score,
        }

        final_score = self.aggregate(component_scores)
        confidence = self.confidence_engine.calculate(company.get("evidence", {}))

        criteria_scores = self.calculate_criteria_scores(
            component_scores,
            confidence,
            len(events_list),
            len(signals_list),
        )
        judging_score = self.aggregate_criteria(criteria_scores)

        top_driver = max(component_scores, key=component_scores.get)
        explanation = {
            "summary": (
                f"Primary risk driver is {top_driver} with a weighted score of "
                f"{component_scores[top_driver]:.1f}."
            ),
            "top_driver": top_driver,
            "evidence_count": int(company.get("evidence", {}).get("sources", 0)),
        }

        return {
            "company_id": company.get("id"),
            "scores": component_scores,
            "final_score": final_score,
            "confidence": confidence,
            "status": self.classify_score(final_score),
            "criteria_scores": criteria_scores,
            "judging_score": judging_score,
            "explanation": explanation,
            "audit": {
                "stages": [
                    "data_ingestion",
                    "entity_resolution",
                    "knowledge_graph",
                    "risk_models",
                    "aggregation",
                    "confidence",
                    "alerts",
                ],
                "event_count": len(events_list),
                "signal_count": len(signals_list),
            },
        }

    def aggregate(self, scores: Dict[str, float]) -> float:
        weighted_total = 0.0
        for key, score in scores.items():
            weighted_total += float(score) * self.weights.get(key, 0.0)
        return round(weighted_total, 2)

    def calculate_criteria_scores(
        self,
        component_scores: Dict[str, float],
        confidence: float,
        event_count: int,
        signal_count: int,
    ) -> Dict[str, float]:
        ai_score = min(
            100.0,
            (
                0.30 * component_scores.get("entity", 0)
                + 0.20 * component_scores.get("graph", 0)
                + 0.15 * component_scores.get("behavior", 0)
                + 0.15 * component_scores.get("event", 0)
                + 0.10 * component_scores.get("regulatory", 0)
                + 0.10 * component_scores.get("geopolitical", 0)
            )
            * 0.7
            + confidence * 0.3,
        )
        cost_score = min(
            100.0,
            100.0 - min(70.0, event_count * 4.0 + signal_count * 1.5),
        )
        ux_score = min(
            100.0,
            confidence * 0.6 + 30.0 + min(20.0, (confidence / 5.0)),
        )
        compliance_score = min(
            100.0,
            confidence * 0.7 + min(30.0, confidence * 0.3),
        )
        engineering_score = min(
            100.0,
            70.0 + min(20.0, confidence * 0.1) + min(10.0, (event_count + signal_count) * 0.5),
        )

        return {
            "AI Intelligence Quality": round(ai_score, 2),
            "Cost Efficiency": round(cost_score, 2),
            "UX & Explainability": round(ux_score, 2),
            "Compliance & Safety": round(compliance_score, 2),
            "Engineering & Architecture": round(engineering_score, 2),
        }

    def aggregate_criteria(self, criteria_scores: Dict[str, float]) -> float:
        weighted_total = 0.0
        for key, score in criteria_scores.items():
            weighted_total += float(score) * self.criteria_weights.get(key, 0.0)
        return round(weighted_total, 2)

    def classify_score(self, score: float) -> str:
        if score >= self.thresholds["high"]:
            return "high"
        if score >= self.thresholds["medium"]:
            return "medium"
        return "low"

    def run_batch(
        self,
        companies: Iterable[Dict[str, Any]],
        graph: Dict[str, Any] | None,
        events: Dict[str, Iterable[Dict[str, Any]]],
        signals: Dict[str, Iterable[Any]],
    ) -> list[Dict[str, Any]]:
        results = []
        for company in companies:
            company_id = company.get("id")
            result = self.calculate_company_risk(
                company,
                graph,
                events.get(company_id, []),
                signals.get(company_id, []),
            )
            results.append(result)
        return results
