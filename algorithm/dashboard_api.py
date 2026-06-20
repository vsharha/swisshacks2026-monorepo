from __future__ import annotations

from typing import Any, Dict


class DashboardAPI:
    """Simple API facade for dashboard consumers."""

    @staticmethod
    def serialize(result: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "company_id": result.get("company_id"),
            "final_score": result.get("final_score"),
            "confidence": result.get("confidence"),
            "status": result.get("status"),
            "scores": result.get("scores", {}),
            "criteria_scores": result.get("criteria_scores", {}),
            "judging_score": result.get("judging_score"),
            "explanation": result.get("explanation", {}),
            "audit": result.get("audit", {}),
            "alerts": result.get("alerts", {}),
        }
