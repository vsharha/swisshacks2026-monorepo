from __future__ import annotations

from typing import Any, Dict, Iterable

from .alert_engine import AlertEngine
from .orchestrator import RiskOrchestrator


class RiskPipeline:
    """End-to-end batch process for computing and saving company risk outputs."""

    def __init__(self) -> None:
        self.orchestrator = RiskOrchestrator()
        self.alert_engine = AlertEngine()

    def run(
        self,
        companies: Iterable[Dict[str, Any]],
        graph: Dict[str, Any] | None,
        events: Dict[str, Iterable[Any]],
        signals: Dict[str, Iterable[Any]],
        save_results: Any | None = None,
    ) -> list[Dict[str, Any]]:
        results = self.orchestrator.run_batch(companies, graph, events, signals)

        for result in results:
            company_id = result["company_id"]
            previous_score = None
            company = next((c for c in companies if c.get("id") == company_id), None)
            if company:
                previous_score = company.get("previous_score")

            alerts = self.alert_engine.evaluate(
                result["final_score"],
                previous_score,
                result["confidence"],
            )
            result["alerts"] = alerts

            if save_results is not None:
                save_results(
                    company_id,
                    result["final_score"],
                    result["confidence"],
                    alerts,
                )

        return results
