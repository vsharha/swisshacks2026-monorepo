from __future__ import annotations

from typing import Any, Dict, Iterable


class DataIngestionServer:
    """Normalizes raw payloads into the pipeline input contract."""

    @staticmethod
    def ingest(raw_items: Iterable[Dict[str, Any]]) -> list[Dict[str, Any]]:
        normalized = []
        for item in raw_items:
            normalized.append(
                {
                    "id": item.get("id") or item.get("entity_id"),
                    "raw": item,
                    "timestamp": item.get("timestamp"),
                    "source": item.get("source"),
                }
            )
        return normalized
