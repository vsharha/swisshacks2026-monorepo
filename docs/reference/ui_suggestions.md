# Graph Intelligence & Defense Workflow

## Purpose

The current drift-monitor architecture identifies material changes in customers and generates explainable alerts. This proposal extends the platform with:

* Ownership and influence intelligence
* Watchlist and sanctions propagation
* Relationship-based risk detection
* Action-oriented workflows
* Three Lines of Defense governance
* Escalation and decision auditability

The objective is not only to detect risk, but to ensure risk is investigated, documented, and resolved through a structured operational process.

---

# Knowledge Graph Intelligence Layer

## Overview

A graph intelligence layer sits between ingestion and scoring.

Instead of analyzing customers as isolated entities, the platform continuously evaluates relationships between:

* Companies
* Beneficial Owners
* Directors
* Shareholders
* Investors
* Countries
* Wallets
* Exchanges
* Regulators
* Sanctioned Parties

This enables hidden-risk discovery and influence analysis beyond direct ownership.

---

## Graph Model

### Nodes

```text
Company
Person
Shareholder
Director
Investor
Country
Wallet
Exchange
Regulator
Fund
```

### Relationships

```text
OWNS
CONTROLS
BOARD_MEMBER_OF
INVESTED_IN
PARTNERS_WITH
OPERATES_IN
TRANSACTS_WITH
REGISTERED_IN
SANCTIONED_BY
CONNECTED_TO
```

---

# Influence Scoring

Not all owners create equal risk.

The graph calculates:

```text
Ownership %
+
Board Influence
+
Control Rights
+
Network Centrality
+
Sanctions Exposure
```

to generate:

```text
Influence Score (0-100)
```

Examples:

* Founder owning 55% = High Influence
* Board Chair with veto rights = High Influence
* Minority investor with no control = Low Influence
* Sanctioned UBO = Critical Influence

---

# Hidden Controller Detection

The graph should identify:

### Direct Control

```text
Person
  ↓
Company
```

### Indirect Control

```text
Person
  ↓
Holding Company
  ↓
Fund
  ↓
Target Company
```

### Coordinated Control

```text
Person A
Person B
Person C

acting together

→ effective control
```

These findings generate ownership-axis enrichment signals.

---

# Watchlist Intelligence

## Watchlist Categories

### Internal Watchlists

* Previous investigations
* Escalated customers
* Historical SAR cases
* Internal blacklists

### Regulatory Watchlists

* OFAC
* UN
* EU
* UK HMT
* FATF

### Enhanced Due Diligence Watchlists

* High-risk industries
* Politically Exposed Persons
* Offshore structures
* High-risk jurisdictions

---

## Watchlist Propagation

Direct matches are insufficient.

Risk should propagate through:

```text
Company
↓
Owner
↓
Sanctioned Party
```

and

```text
Company
↓
Investor
↓
Sanctioned Fund
```

Risk decreases with relationship distance but remains visible.

Example:

```text
1st Degree = 100%
2nd Degree = 60%
3rd Degree = 35%
```

---

# Sanctions Intelligence

## Screening Targets

Screen:

* Company
* Beneficial Owners
* Directors
* Investors
* Wallets
* Related Parties

against:

* OFAC
* OpenSanctions
* UN
* EU
* UK

---

## Sanctions Exposure Types

### Direct Exposure

Entity is sanctioned.

### Ownership Exposure

UBO is sanctioned.

### Investor Exposure

Investor is sanctioned.

### Wallet Exposure

Wallet connected to sanctioned activity.

### Country Exposure

Entity operates in sanctioned jurisdiction.

Each exposure type creates an explainable signal.

---

# Relationship Risk Propagation

Risk is inherited.

Example:

```text
Company A

Owned by

Holding B

Controlled by

Sanctioned Person C
```

The platform generates:

```text
Ownership Risk
Sanctions Risk
Reputation Risk
```

even if Company A has no direct sanctions hit.

---

# Action-Oriented Alerting

Current alerts answer:

"What happened?"

Future alerts should answer:

"What should we do next?"

---

## Alert Structure

### Risk Score

```text
0-100
```

### Confidence Score

```text
0-100
```

### Why

Evidence summary.

### Relationship Path

Graph explanation.

### Recommended Action

Operational recommendation.

### Owner

Assigned reviewer.

### SLA

Response deadline.

---

# Action Recommendation Framework

## Low Risk

Actions:

* Monitor
* No immediate action

---

## Medium Risk

Actions:

* Watchlist
* Request additional information

---

## High Risk

Actions:

* Enhanced Due Diligence
* Compliance Review

---

## Critical Risk

Actions:

* Restrict Services
* Freeze Onboarding
* Offboarding Review

---

# Three Lines of Defense

## First Line — Operations

### Responsibilities

* Review alerts
* Validate evidence
* Contact customer
* Gather documentation

### Decisions

* Dismiss
* Monitor
* Escalate

### SLA

24 Hours

---

## Second Line — Compliance

### Responsibilities

* Enhanced Due Diligence
* Ownership verification
* Regulatory assessment
* Risk recalculation

### Decisions

* Approve
* Remediate
* Escalate

### SLA

48 Hours

---

## Third Line — Risk Committee / Audit

### Responsibilities

* High-risk approvals
* Restriction decisions
* Offboarding decisions
* Policy exceptions

### Decisions

* Continue Relationship
* Restrict Services
* Suspend Activity
* Exit Customer

### SLA

7 Days

---

# Escalation Workflow

```text
Alert Generated
        ↓

First Line Review
        ↓

Pass
Dismiss
Escalate

        ↓

Second Line Review
        ↓

Approve
Remediate
Escalate

        ↓

Third Line Review
        ↓

Final Decision
```

Every transition creates an immutable audit record.

---

# Audit & Explainability

Every decision stores:

* Risk Score
* Confidence Score
* Evidence Sources
* Relationship Path
* Reviewer
* Timestamp
* Decision
* Recommended Action
* Outcome

This creates a complete regulatory audit trail.

---

# Future Enhancements

## Influence Analytics

Identify:

* Most influential owners
* Most connected entities
* Hidden control clusters

## Network Centrality

Detect:

* Gatekeepers
* High-risk intermediaries
* Network concentration

## Predictive Risk

Forecast:

* Ownership instability
* Regulatory exposure
* Probability of escalation

## Case Management

Create investigation cases directly from alerts and track remediation through closure.

## Relationship-Based Monitoring

Automatically reassess all connected entities when a material risk event occurs.

This extends the current change-triggered architecture into a continuously connected risk-intelligence network.
