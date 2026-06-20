from __future__ import annotations

from typing import Any, Dict, Iterable


class EntityResolutionServer:
    """Resolves entities from ingested records into a company profile."""

    @staticmethod
    def resolve(records: Iterable[Dict[str, Any]]) -> list[Dict[str, Any]]:
        resolved = []
        for record in records:
            entity = dict(record.get("raw", {}))
            entity.setdefault("id", record.get("id"))
            entity.setdefault("countries", [])
            entity.setdefault("evidence", {})
            resolved.append(entity)
        return resolved
