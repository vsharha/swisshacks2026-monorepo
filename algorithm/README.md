# Algorithm Pipeline

This folder contains a lightweight risk-analysis pipeline that mirrors the flow of a KYC / compliance monitoring system.

## Purpose

The algorithm package takes raw company, event, signal, and graph data; resolves entities; computes risk signals from multiple domains; aggregates them into a final score; and prepares alert/dashboard outputs.

## Pipeline Overview

1. **Data Ingestion**
   - Normalizes raw records into a consistent input shape.
   - Handles source metadata and timestamps.

2. **Entity Resolution**
   - Converts ingested records into company-like objects.
   - Ensures each entity has an identifier and basic profile fields.

3. **Knowledge Graph**
   - Builds a graph view from resolved companies.
   - Captures node information and entity relationships.

4. **Risk Models**
   - Scores each company across multiple dimensions:
     - entity risk
     - graph risk
     - behavioral risk
     - event risk
     - regulatory risk
     - geopolitical risk

5. **Risk Aggregator**
   - Combines the component model outputs using configured weights.
   - Produces a final composite risk score.

6. **Confidence Engine**
   - Evaluates evidence reliability using source, recency, consistency, and citation signals.

7. **Alert Engine**
   - Determines whether a score change or high-risk outcome should trigger an alert.

8. **Dashboard / API Output**
   - Serializes the final results into a structure suitable for dashboards or API responses.

## Core Files

- `config.py` — risk weights, thresholds, and alert settings
- `data_ingestion.py` — ingests and normalizes raw data
- `entity_resolution.py` — resolves records into company entities
- `knowledge_graph.py` — builds graph structures
- `orchestrator.py` — runs the main company risk computation flow
- `pipeline.py` — batch processing entry point
- `risk_aggregator.py` — combines model outputs
- `alert_engine.py` — evaluates alert conditions
- `dashboard_api.py` — formats output for UI/API use
- `models/` — domain-specific scoring models

## Example Flow

A typical run looks like this:

1. Ingest raw records.
2. Resolve entities.
3. Build a graph.
4. Compute component scores.
5. Aggregate into one score.
6. Calculate confidence.
7. Trigger alerts if needed.
8. Return serialized results.

## Judging Criteria Alignment

The pipeline is designed to reflect the judging rubric more explicitly:

AI Intelligence Quality	Accurate flags, strong reasoning, useful insights	25%
Cost Efficiency	Smart model usage, efficient pipelines	20%
UX & Explainability	Clear alerts, intuitive UI, human-readable reasoning	20%
Compliance & Safety	Guardrails, explainability, auditability	20%
Engineering & Architecture	Scalable design, modular pipelines, robustness	15%

## Notes

The implementation is intentionally modular so each stage can be improved or replaced independently as the risk model evolves. The added criteria outputs make it clearer how the pipeline is optimized for the judging rubric, not just for a raw numeric score.
