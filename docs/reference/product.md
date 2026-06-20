# Product — Dynamic KYC-Drift Monitor

> SwissHacks 2026 · AMINA Bank challenge — *Dynamic Risk Profiling System (Real-Time Intelligence)*

## One line

Continuous, cheap monitoring of a whole book of customers; deep LLM reasoning fires **only** when a customer's KYC baseline structurally breaks.

## The problem we attack

Banks hold rich internal KYC/AML data, but the signals that invalidate a customer's risk profile usually surface **first in public** — news, registries, funding, ownership changes. The hardest version of this is **KYC drift**: slow, structural change that quietly invalidates the assumptions a customer was onboarded under, without ever tripping a single dramatic fraud alert. A company onboarded as low-risk drifts into high-risk while nobody re-screens it.

## Differentiation thesis (the flag we plant)

**KYC drift + cost-aware tiering, told as one story:** *continuous cheap monitoring of structural drift, escalating to deep reasoning only when the profile breaks.*

These two reinforce each other. Drift is a slow signal across an entire book — you cannot afford to run heavy reasoning on every customer every day, so cheap filters watch for drift and expensive reasoning fires only when a baseline genuinely shifts. The escalation logic **is** the cost story.

Most teams will build a live news-alerting feed. We build a drift detector whose economics are a structural property, not an afterthought.

## The drift model (core intelligence)

We decompose each customer's KYC baseline into a **5-axis drift vector**:

| Axis | What drifts | Example flags (from challenge use-case table) |
|---|---|---|
| Business model | What the company actually does | Material Business Model Change; Business Activity Change |
| Ownership / control | Who owns / runs it | Ownership Change – KYC Drift; new beneficial owners |
| Geography / jurisdiction | Where it's domiciled / operates | Structural Risk Change; jurisdiction move |
| Scale / activity | Size, volume, funding, tempo | Scale Risk Change; Dormancy Break |
| Reputation / adverse media | How it's perceived | High Reputational Risk |

Each axis is scored by a **rule → LLM cascade**:
- **Cheap tier** — deterministic rules + embeddings catch discrete, unambiguous changes (legal rename, new owner, jurisdiction/legal-form change, domain switch) and produce a first-pass drift score from metadata alone.
- **Escalation** — only *fuzzy* axes (gradual pivot, adverse-media tone) get sent to an LLM to reason about materiality.

A weighted **composite** across axes produces an overall KYC-drift status. Crossing a threshold fires **Stage 3** deep synthesis: recommended action + citations + human-in-the-loop.

The drift vector is both the intelligence and the dashboard — it makes every alert explainable ("the ownership axis broke, here is why").

## Pattern library (reasoning by analogy)

The system holds a small library of **known drift archetypes** with documented outcomes. The flagship entry is **Long Blockchain Corp (2017)** — the "struggling consumer brand + hot buzzword + rename + stock pump + thin substance" archetype, which ended in SEC insider-trading charges and delisting.

At Stage 3, the live entity's drift signature is matched against the library so the system can output an **outcome prior**, not just an alert:

> "This drift matches a known archetype — Long Blockchain Corp (2017), which followed the same arc and ended in SEC charges and delisting. Base-rate outcome is adverse → recommend enhanced due diligence + re-KYC."

This is what upgrades the product from detection to judgment, and it legitimately justifies (and documents) raising the risk weight.

## Scenario & entities

**Hero — Allbirds → "NewBird AI" → "Smartbird" (live 2026).** A sustainable footwear brand that pivoted to AI / GPU-as-a-Service. Real, traceable, and current:
- **2024:** Nasdaq delisting threat (sub-$1 for 30 days), 1-for-20 reverse split, revenue down ~25%.
- **Apr 15 2026:** announces AI pivot + $50M convertible financing, rebrands "NewBird AI", stock **~600%** (market cap ~$21M → ~$148M).
- Sells its footwear business to American Exchange Group (~$39M; company once valued ~$4B).
- **Jun 17 2026:** renames again to "Smartbird", hires CEO Nadia Carlsten; stock soars again.

Fires 4 of 5 axes (business model, entity identity/ownership, scale/activity, reputation); the only gap is jurisdiction. Sources: SEC 8-K (CIK 1653909), EventRegistry news, Wayback.

**Pattern library — Long Blockchain (2017):** reference knowledge, not a monitored customer. Long Island Iced Tea Corp → Long Blockchain Corp (Dec 2017), ~500% spike, Nasdaq delisting (Jun 2018), SEC registration revoked (Feb 2021), insider-trading charges (Jul 2021).

**Background portfolio (2–3 customers):**
- One **Wirecard-modeled** entity — drifts on ownership + jurisdiction (the axes Allbirds misses): shadow ownership, offshore escrows. Escalates partway (Stage 2) to show a *different kind* of drift.
- **1–2 deliberately stable customers** — never escalate. They are not filler: they prove the cheap tiers absorb them for ~$0 (cost story) and that the system has specificity / a low false-positive rate (quality story).

The demo is a **book of ~3–4 customers**, depth concentrated on the hero. The contrast across the book is what sells both cost efficiency and precision — a single-company demo would undercut the pitch.

## Demo narrative

A "Risk Control Room" dashboard (see `frontend.md`) showing the customer book and a **time-scrubber**. Drag the clock and:
1. The hero's **drift vector lights up axis-by-axis** with real citations as real events replay.
2. The **cost funnel ticks live** — thousands of signals collapse to a handful of LLM calls; `$/day` stays near $0.75.
3. Composite crosses threshold → **escalation flare**: the "matches Long Blockchain 2017" badge snaps in, a **RE-KYC alert** card appears with citations, and a **human escalate/dismiss action** writes to the audit log.

The real Allbirds timeline is already compressed into ~2 months, so the scripted clock barely has to compress anything — naturally fast and fully evidenced.

## Guardrails & governance

- **Structured outputs** validated by Zod schemas — schema validation is a real, demonstrable hallucination check.
- **Confidence scores** and **source citations** on every claim.
- **Human-in-the-loop** approval gate before any risk-rating change.
- **Append-only audit log** — the regulatory record of the drift-detection → human-decision loop. Captures: signal ingested (provenance), drift evaluation (tier, confidence, token cost), escalation decision (why Stage 3 fired *or didn't*), alert (reasoning + citations + model version), human action (analyst, decision, rationale, timestamp), outcome (risk-rating change). It doubles as documentation of the cost decisions. Optional hash-chain for tamper-evidence if time allows.
- **Data separation** between public (Layer 1) and internal (Layer 2) enforced architecturally (separate modules/stores).

## User workflows (three lines of defence)

The monitor maps onto the bank's **three lines of defence**, so each role gets exactly the slice it needs — and the **trail of actions** one line produces becomes the evidence the next line consumes. One drift event flows 1st → 2nd → 3rd line, gaining a decision and an audit record at each step.

### 1st line — Relationship Manager (front office)

Owns the customer relationship and is accountable for the risk on it. Lives in the Risk Control Room book view.

- Watches the live **drift vector** per customer; the cheap tiers absorb the stable book at ~$0, so attention only goes where a baseline is actually moving.
- When a composite crosses the threshold, receives the **RE-KYC alert** with per-axis reasoning, the "matches Long Blockchain 2017" outcome prior, and citations.
- Acts at the **human-in-the-loop gate**: *escalate* (hand off to the 2nd line for re-KYC) or *dismiss* (with a rationale). Both write to the append-only log — the start of the **trail of actions**.

### 2nd line — Risk & Compliance / MLRO (independent oversight)

Independent of the front office. Owns screening and is where escalations land.

- Receives 1st-line escalations and drills from the drift signature into the underlying signals and the **beneficial-owner / investor screening** — the ownership axis hooks the drift to the people behind the entity (shadow ownership, offshore investors).
- Confirms materiality from the Stage 2/3 outputs, weighs the pattern-library outcome prior, and owns the **risk-rating change** (the `outcome` audit event).
- **Influences strategy**: tunes the detection knobs — axis weights, composite/watch thresholds, escalation policy — that decide what the cheap tiers send up. This is where the bank's risk appetite is encoded, and every change is itself logged.

### 3rd line — Internal Audit / Compliance assurance (independent assurance)

Reads the system end-to-end; never operates it.

- Consumes the **append-only, hash-chained audit log** as a complete chain: signal ingested (provenance) → drift evaluated (tier, confidence, token cost) → escalation decision (why Stage 3 fired *or didn't*) → alert (reasoning, citations, model version) → human action (analyst, decision, rationale) → outcome (rating change).
- Verifies the **trail of actions** is complete and tamper-evident, and can reconstruct any rating change from first principles — who decided what, on which evidence, at what cost.
- Reviews the cost decisions and the false-positive / false-negative profile across the book to assure the 2nd line's strategy is sound.

## Judging-criteria alignment

| Criterion | Weight | How we hit it |
|---|---|---|
| AI Intelligence Quality | 25% | 5-axis drift reasoning + pattern-match outcome priors; explainable per-axis verdicts |
| Cost Efficiency | 20% | Change-triggered tiered cascade; live per-stage token/$ accounting vs naive baseline (see `techstack.md`) |
| UX & Explainability | 20% | Risk Control Room dashboard; per-axis reasoning; citations; human-readable alerts |
| Compliance & Safety | 20% | Zod guardrails, confidence, citations, HITL gate, append-only audit log, public/internal separation |
| Engineering & Architecture | 15% | Modular pipeline, one-connector-two-callers extraction, shared Zod schemas |

## Scope (balanced slice)

Real engine for the hero entity's key signals + a focused, polished dashboard that touches every judging axis. Only the hero gets full real extraction; background entities get lighter, partly-curated signal sets so the funnel numbers stay real without building deep engines for each.
