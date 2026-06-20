# Hackathon — Continuous KYC Risk Monitoring — Requirements

**Status:** Draft — Created: 18 June 2026 — Last updated: 18 June 2026 (tech stack + business case added)

---

## Problem Statement

Banks are legally required to maintain up-to-date risk profiles for all customers (KYC/AML). Today this process is almost entirely manual: compliance officers periodically re-screen customers, check sanctions lists, and review news — a slow, expensive, and error-prone workflow that doesn't scale.

When a high-risk customer slips through because a news article was missed, or a company's ownership changed without anyone noticing, the bank faces regulatory fines, reputational damage, and potential complicity in financial crime.

**The core problem:** Customer risk is treated as a point-in-time snapshot, not a continuous signal.

This is especially acute in crypto-banking: the bank's clients are crypto-native companies — exchanges, token issuers, DeFi protocols, Web3 infrastructure providers — whose business models, ownership structures, and regulatory classifications can shift dramatically within weeks. A company that was legitimately registered as a payment processor can pivot to unlicensed crypto exchange activity without any single event triggering a traditional alert.

---

## Mission Statement

Help crypto-focused financial institutions continuously detect KYC drift in their client book — where business models, token activities, and ownership structures evolve faster than periodic re-screening can track — before regulatory exposure compounds.

---

## Business Case

**Pitch framing:** "Palantir for banking and crypto-banking transactions."

Banks today do not continuously verify who the actors behind their clients are, what their networks look like, or what recent changes might have shifted their risk profile. When they miss ongoing KYC drift, the cost is not millions — it's billions.

**Real regulatory fines we sell against:**

| Bank | Year | Fine | Root cause |
|------|------|------|------------|
| HSBC | 2012 | $1.9B | Failed to update KYC profiles of clients whose networks shifted into cartel-linked activity |
| Danske Bank Estonia | 2018 | €200B laundering scandal | Customer profiles never refreshed as business models changed |
| ING | 2018 | €775M | Inadequate ongoing customer monitoring |
| Raiffeisen International | 2024 | Ongoing FINMA scrutiny | Client drift into sanctioned status went undetected |

**Our value proposition:** A bank using our system catches these scenarios early. A bank that doesn't is one bad client away from a multi-billion regulatory hit.

**Why crypto-banking is the hardest version of this problem:**
AMINA Bank's client book consists primarily of crypto-native companies. These entities face uniquely compressed risk timelines: a token issuer can be reclassified by a regulator overnight; a DeFi protocol's main backer can appear on an OFAC list; a Web3 startup can quietly pivot from NFT marketplace to unlicensed money transmission. Standard periodic re-screening — typically quarterly or annual — is structurally unable to catch drift at this speed.

---

## Solution Overview

We build a **Continuous KYC Risk Monitoring Platform** for banks.

Banks connect via API. We ingest their existing customer profiles (individuals and legal entities). From that point on, we continuously poll public data sources — sanctions lists, company registries, news — and detect meaningful drift in customer attributes.

When drift is detected, we recompute the customer's risk score. If the score crosses a threshold, an alert is raised and a compliance officer reviews it. Every AI decision, score change, and human action is persisted in an immutable audit log.

**Platform users (who operates the dashboard):** Compliance, AML, and KYC teams within AMINA Bank, as well as risk officers responsible for ongoing customer due diligence and transaction monitoring.

**Platform clients (who is being monitored):** AMINA Bank's own client book — primarily crypto-native companies: exchanges, custodians, token issuers, DeFi protocol operators, and other Web3-facing entities operating in regulated jurisdictions.

---

## MVP Scope

### We build

| Area | What |
|------|------|
| **Drift detection** | Monitor the 9 core fields listed below (Mirco's MVP list) |
| **Risk scoring** | 3-tier model (score 0 / 1–5 / >5) with floor logic for critical events |
| **Source polling** | Sanctions lists (daily), news (daily), company registry (weekly) |
| **Cost-optimized cascade** | Cheap filter for low-risk → deep LLM reasoning only for high-risk |
| **Alerts** | Human-reviewable alert cards with AI-generated explanation |
| **Audit log** | Append-only log of every score change, AI decision, and human action |
| **Bank API** | REST API to ingest customer data and push back updated risk info |

### We do NOT build (out of scope for MVP)

| Area | Why |
|------|-----|
| Full KYC onboarding flow | We consume existing profiles, not create them |
| Real-time streaming data | Periodic polling is sufficient for the MVP |
| Embeddings similarity pre-filter | Mirco's ML idea — decision pending, excluded from MVP |
| Multi-bank tenant management | Single bank instance only |
| Native bank system integrations | API-first; no direct core banking connectors |
| Custom report generation | Out of scope; audit log covers compliance trail |

---

## High-Level Architecture

### Two-Layer Drift Detection

```
Layer 1 — Baseline Drift (high reliability)
  Sources: Zefix, official company registries, SECO/UN/OFAC sanctions lists
  Signal type: Structured, deterministic
  Reliability: High — no confidence scoring needed

Layer 2 — Enrichment Drift (interpretive signals)
  Sources: News APIs, reputation databases, web search
  Signal type: Unstructured, probabilistic
  Reliability: Requires confidence scoring before contributing to final score
```

### Risk Scoring Model

```
Score 0           → No risk        (no action)
Score 1–5         → Low risk       (monitored)
Score > 5         → High risk      (alert raised, human review required)

Floor logic:
  Critical single events (e.g. direct sanctions hit, high-risk country of domicile)
  → Jump straight to Score 5, regardless of all other signals.
  One severe signal alone is sufficient to place a customer in the high-risk tier.
```

Score is computed **event-driven**: recalculated whenever a monitored field changes. The final score is **cumulative** across all active drift signals, subject to the floor logic above.

### Monitored Drift Fields (Mirco's MVP List)

| Field | Type | Priority |
|-------|------|----------|
| Name | Individual + Entity | Critical — direct sanctions screening |
| Country of domicile | Individual + Entity | High — floor trigger if high-risk country |
| Country of activity | Entity | High |
| Industry sector | Entity | High — especially shifts to oil, weapons |
| Nationality | Individual | High — floor trigger if sanctioned nationality |
| Revenue | Entity | Medium |
| Main shareholders (>25%) | Entity | High |
| Top management (CEO, CFO, Chairman) | Entity | High |
| Crypto license / regulatory classification | Entity | High — reclassification from licensed exchange to unlicensed triggers immediate review |
| Primary token / blockchain activity type | Entity | Medium — pivot in on-chain activity (e.g. payment → DeFi yield, NFT → OTC trading) |

### Cost-Optimized Processing Cascade

The main efficiency story for the pitch:

```
Customer event arrives
        │
        ▼
  Cheap filter
  (embeddings or small model)
        │
   ┌────┴────┐
   │         │
Low risk   High risk / uncertain
   │         │
   ▼         ▼
 Log only  Deep LLM reasoning
           (Claude Opus or equivalent)
           → structured explanation
           → score delta
           → alert card
```

**Why this wins:** Deep LLM calls are expensive. Routing only ambiguous and high-risk customers to the expensive model keeps operating costs proportional to actual risk exposure — not to customer volume.

### Source Polling Schedule

| Source | Frequency | Layer |
|--------|-----------|-------|
| Sanctions lists (SECO, UN, OFAC) | Daily | Baseline |
| News APIs | Daily | Enrichment |
| Company registries (Zefix, etc.) | Weekly | Baseline |

---

## Tech Stack

**Locked in for the hackathon.**

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | SvelteKit | UI for compliance officer dashboard and alert cards |
| **Backend** | TypeScript | Drift-detection logic and scoring engine live in `packages/core`, consumed by SvelteKit server routes |
| **LLM layer** | Vercel AI SDK | Provider-agnostic — switch between OpenAI, Claude, Gemini during the hackathon to find the best fit per use case |
| **Database** | Drizzle ORM | Clean, simple DB operations |
| **Containerization** | Docker | Consistent dev and deploy environment |
| **Package manager** | pnpm | Workspace-aware installs across the monorepo |
| **Repository** | Monorepo | `apps/` and `packages/` workspaces — clean separation, one place to manage |

```
repo/
  apps/web/         ← SvelteKit app
  packages/core/    ← drift engine + scoring (TypeScript)
  packages/scripts/ ← offline extraction & baseline build
  docker-compose.yml
```

---

## Demo Flow

Step-by-step walkthrough for the pitch presentation:

**1. Setup context (30 seconds)**
Show a compliance officer dashboard. A bank has 500 active customers. Manual re-screening takes weeks. We are about to show how the system handles it continuously.

**2. Baseline state (30 seconds)**
Pick one customer — a mid-size crypto exchange onboarded as a low-risk payment facilitator. Score: 2 (low risk). Last reviewed 3 months ago.

**3. Trigger an event (30 seconds)**
Behind the scenes: our daily sanctions poll picks up a new entry matching the company's main shareholder. The system detects drift on the "Main shareholders" field.

**4. Score recomputation (30 seconds)**
Show the event being processed. Floor logic kicks in — shareholder sanctions hit → score jumps directly to 5 (floor trigger). System escalates to deep LLM reasoning.

**5. Alert card (60 seconds)**
Show the generated alert card:
- What changed (shareholder X matched on OFAC list)
- Why it matters (direct sanctions exposure)
- AI-generated plain-language explanation
- Recommended action (freeze, escalate, full KYC refresh)
- One-click "Approve / Dismiss / Escalate" for the compliance officer

**6. Audit trail (30 seconds)**
Click into the audit log. Show the immutable record: source event, score delta, AI decision, timestamp, officer action. Fully traceable for regulators.

**7. Cost story (30 seconds)**
Show that 490 of 500 customers passed through the cheap filter. Only 10 triggered deep LLM calls. Operating cost is proportional to risk, not volume.

---

## Key Differentiators

**Why our solution wins:**

| Differentiator | What it means |
|---------------|---------------|
| **Continuous, not periodic** | Risk changes are caught within hours, not months. Banks stop flying blind between manual review cycles. |
| **Floor logic for critical events** | A single sanctions hit is enough. No averaging away a nuclear signal with positive factors. |
| **Cost-optimized cascade** | We only spend on LLM compute where it matters. Cheap filter absorbs the volume; deep reasoning handles the risk. |
| **Explainable AI, human decision** | Every alert comes with a plain-language explanation. Compliance officers make the final call — the system augments, not replaces. |
| **Immutable audit log** | Every AI decision and human action is logged. Regulators can reconstruct the full decision trail. No black-box liability. |
| **Two-layer architecture** | Separating high-reliability registry data from interpretive news signals means scores are stable and not polluted by noisy sources. |
| **API-first, bank-agnostic** | We plug into whatever the bank already has. No ripping out core systems. |
| **Crypto-native drift signals** | Monitors license reclassifications, token-activity pivots, and on-chain ownership shifts that generic corporate registries don't capture — purpose-built for a crypto bank's client book. |

---

## Open Points

| Item | Owner | Status |
|------|-------|--------|
| Final scoring weights per drift field type | Mirco | Refining |

---

## Done When

- [ ] Drift detection runs for all 9 MVP fields
- [ ] Risk score computed event-driven with floor logic for critical events
- [ ] Sources polled on schedule (sanctions daily, news daily, registry weekly)
- [ ] Cost-optimized cascade routes low-risk through cheap filter, high-risk through LLM
- [ ] Alert card generated with AI explanation and officer action buttons
- [ ] Audit log captures every score change, AI decision, and human action
- [ ] Bank API accepts customer data ingest and returns updated risk info
- [ ] Demo flow runs end-to-end without errors
