# Risk Intelligence Extensions

The current architecture is optimized for detecting customer drift. To support a crypto-bank KYC/KYB operating model, the drift engine is extended with a continuous risk-intelligence layer that enriches, rather than replaces, the existing 5-axis framework.

The drift axes remain the primary mechanism for change detection:

```text
business_model
ownership
scale
reputation
jurisdiction
```

Additional intelligence sources generate risk signals that can either:

1. Enrich existing drift axes
2. Be surfaced as standalone risk dimensions
3. Feed explainable alerts and recommendations

---

## Expanded Risk Dimensions

The platform continuously evaluates the following risk dimensions:

| Risk Dimension     | Description                                                      |
| ------------------ | ---------------------------------------------------------------- |
| Regulatory Risk    | Licensing status, enforcement actions, legal proceedings         |
| AML Risk           | Suspicious activity indicators, transaction anomalies            |
| Sanctions Risk     | Direct and indirect sanctions exposure                           |
| Geopolitical Risk  | Country instability, FATF status, political events               |
| Market Risk        | Liquidity stress, funding deterioration, insolvency indicators   |
| Operational Risk   | Governance failures, executive turnover, control weaknesses      |
| Ownership Risk     | UBO changes, concentration of control, hidden influence          |
| Reputation Risk    | Adverse media, investigations, litigation                        |
| Crypto Native Risk | Wallet exposure, mixers, darknet links, high-risk counterparties |

---

## Additional Intelligence Sources

The ingestion layer expands beyond news and SEC filings to include:

### MCP Server Intelligence

* Historical KYC decisions
* Previous investigations
* Internal risk assessments
* Transaction monitoring outputs
* Customer profile changes

### Regulatory Intelligence

* SEC
* FCA
* DFSA
* ADGM
* FINMA
* FATF
* Enforcement databases

### Market Intelligence

* Funding announcements
* Liquidity events
* Valuation changes
* Exchange performance indicators

### Sanctions Intelligence

* OFAC
* OpenSanctions
* UN sanctions
* EU sanctions
* UK HMT sanctions

### Corporate Registry Intelligence

* Companies House
* GLEIF
* ZEFIX
* Commercial registries

### Blockchain Intelligence

* Wallet screening
* Mixer exposure
* Darknet exposure
* High-risk counterparty exposure

### Social & Strategic Intelligence

* LinkedIn hiring trends
* Executive departures
* Expansion announcements
* Strategic pivots

---

## Knowledge Graph Intelligence

A graph layer is introduced between ingestion and scoring.

### Graph Nodes

* Companies
* Individuals
* Beneficial Owners
* Investors
* Wallets
* Countries
* Exchanges
* Regulators

### Graph Relationships

* OWNS
* CONTROLS
* INVESTED_IN
* PARTNERS_WITH
* OPERATES_IN
* TRANSACTS_WITH
* BOARD_MEMBER_OF

The graph enables:

* First-degree exposure analysis
* Second-degree exposure analysis
* Third-degree exposure analysis
* Hidden beneficial ownership discovery
* Influence mapping
* Risk propagation

Graph-derived findings are emitted as normal Signals and therefore reuse the existing drift and escalation pipeline.

---

## Risk Propagation

Risk is no longer evaluated solely at the entity level.

Exposure can be inherited through:

* Ownership structures
* Investor relationships
* Shared directors
* Strategic partnerships
* High-risk counterparties
* Country relationships

Example:

Company A
→ Owned by Holding B
→ Funded by Investor C
→ Investor C sanctioned

This creates an ownership and sanctions enrichment signal even if Company A itself is not sanctioned.

---

## Confidence Engine

Every signal, drift score, and alert receives an independent confidence score.

Confidence is derived from:

```text
40% Source Quality
25% Corroboration
20% Freshness
15% Historical Accuracy
```

Examples:

* OFAC match: 99%
* Regulatory filing: 95%
* Corporate registry update: 90%
* Reuters article: 85%
* LinkedIn hiring signal: 65%
* Social media discussion: 35%

Confidence is displayed alongside every alert and recommendation.

---

## Action Recommendation Engine

Stage 3 is extended from alert generation to action recommendation.

Recommended actions include:

* No Action
* Monitor
* Watchlist
* Enhanced Due Diligence
* Senior Compliance Review
* Restrict Services
* Offboarding Review

Recommendations are generated using:

* Drift score
* Risk dimensions
* Confidence score
* Historical outcomes
* Pattern matching

---

## Three Lines of Defense Integration

### First Line — Operations

Actions:

* Review alert
* Validate information
* Contact customer

Target SLA:

24 Hours

### Second Line — Compliance

Actions:

* Enhanced Due Diligence
* Risk reassessment
* Escalation review

Target SLA:

48 Hours

### Third Line — Risk Committee / Audit

Actions:

* Restrict products
* Approve remediation
* Approve offboarding

Target SLA:

7 Days

---

## Continuous Monitoring

The platform performs reassessment twice daily:

* 08:00 UTC
* 20:00 UTC

Reassessment includes:

* New signals
* Relationship changes
* Ownership changes
* Regulatory updates
* Blockchain exposure updates
* Geopolitical developments
* Market intelligence updates

Alert generation becomes event-driven and delta-driven, ensuring risk evaluation scales with change rather than customer volume.

---

## Future Enhancements

* OpenSanctions integration
* GLEIF ownership enrichment
* Predictive risk forecasting
* Graph centrality and influence scoring
* Behavioral anomaly detection
* LLM-based event extraction
* Cross-source event clustering
* Continuous graph-based risk propagation
