RISK_CONFIG = {
    "weights": {
        "entity": 0.25,
        "graph": 0.20,
        "behavior": 0.15,
        "event": 0.15,
        "regulatory": 0.15,
        "geopolitical": 0.10,
    },
    "criteria_weights": {
        "AI Intelligence Quality": 0.25,
        "Cost Efficiency": 0.20,
        "UX & Explainability": 0.20,
        "Compliance & Safety": 0.20,
        "Engineering & Architecture": 0.15,
    },
    "distance_decay": {
        1: 1.0,
        2: 0.6,
        3: 0.35,
    },
    "risk_thresholds": {
        "low": 25,
        "medium": 50,
        "high": 75,
    },
    "alert_delta": 10,
}
