# User Stories & Personas

**Status:** Draft — Created: 20 June 2026

---

## User Personas

### Persona 1 — Sofia, Relationship Manager (1st Line of Defence)

**Role:** Senior Relationship Manager, Corporate Banking
**Team:** Front Office, AMINA Bank
**Daily tools:** CRM, email, internal deal pipeline, Risk Control Room dashboard

**Background:** Sofia owns the client relationship for ~80 corporate clients — primarily crypto-native companies: exchanges, token issuers, DeFi protocol operators. She is the first point of accountability if a client's risk profile changes. She does not conduct deep compliance analysis herself, but she is expected to catch surface-level drift and hand off anything material to the 2nd line.

**Goals:**
- Quickly scan her entire book every morning to spot anything unusual without reading 80 client dossiers
- Get early warning before a client relationship turns into a compliance problem
- Take a clear, logged action on any alert so she has a paper trail

**Pain points before the platform:**
- Risk profile updates came from periodic manual reviews — she would sometimes learn of a client's sanctions exposure from a news article, not from a system
- No easy way to see which of her clients had drifted since onboarding
- Alert fatigue from generic risk tools that flagged everything with equal urgency

**What she uses the platform for:**
- Morning book review: sees each client's drift status at a glance (green / amber / red per axis)
- Reads generated alert cards when a composite threshold is crossed
- Takes the human-in-the-loop action: escalates to compliance or dismisses with a rationale
- Tracks her own action history in the audit log so she can justify decisions to management

---

### Persona 2 — Markus, AML/KYC Analyst (2nd Line of Defence)

**Role:** AML & KYC Compliance Analyst
**Team:** Risk & Compliance / MLRO function, AMINA Bank
**Daily tools:** Sanctions screening tools, compliance case management, Risk Control Room (escalation queue)

**Background:** Markus works independently from the front office. His job is to validate that client risk ratings are correct, conduct enhanced due diligence on escalations, and own the final risk-rating change. He screens beneficial owners and shareholders against OFAC, EU, UN, and OpenSanctions watchlists, and reviews adverse media for material reputational risk. He handles ~15–20 active cases at any time.

**Goals:**
- Only receive escalations that are genuinely material — not noise from every minor news mention
- Have the AI-generated reasoning and source citations ready when he opens a case, so he can verify rather than re-discover
- Produce a decision record that satisfies regulators: who decided what, on what evidence, at what time

**Pain points before the platform:**
- Escalations arrived with no pre-analysis — he had to pull together all the signals himself before he could even assess materiality
- No visibility into why a case was escalated versus handled by the 1st line
- Audit trail was assembled manually from emails and spreadsheet notes

**What he uses the platform for:**
- Works the escalation queue: cases handed off by Relationship Managers (or fired directly when a floor trigger hits)
- Drills into the 6-axis drift vector on each case — sees which axes broke, with per-axis confidence scores and source citations
- Reviews beneficial owner / shareholder data pulled from GLEIF, OpenCorporates, and Zefix, cross-referenced against OpenSanctions
- Reads the pattern-library outcome prior ("matches Long Blockchain 2017 — base-rate outcome: adverse")
- Confirms or rejects materiality, then writes the formal risk-rating change to the audit log
- Tunes detection thresholds (axis weights, escalation policy) to reflect the bank's current risk appetite — every change is itself logged

---

### Persona 3 — Elena, Head of Compliance / MLRO

**Role:** Money Laundering Reporting Officer (MLRO)
**Team:** Compliance leadership, AMINA Bank
**Daily tools:** Executive dashboards, regulatory reporting tools, Risk Control Room (strategic view)

**Background:** Elena is accountable to FINMA for the bank's AML and KYC programme. She does not operate the platform day-to-day but relies on it for strategic oversight: Is the programme catching drift early? Is the false-positive rate low enough that analysts aren't overwhelmed? Is the cost proportional to risk? She reviews the system during regulatory audits and internal compliance reviews.

**Goals:**
- Confidence that no high-risk client is silently drifting through the book undetected
- A defensible, auditable decision trail for every risk-rating change
- Demonstrable cost efficiency — the board asks why the compliance technology budget is what it is

**Pain points before the platform:**
- No aggregate view of how many clients were in drift, at what stage, for how long
- Audit trails assembled ad hoc — hard to reconstruct a decision from first principles under regulator scrutiny
- No way to distinguish real-risk escalations from noise in the volume of compliance activity

**What she uses the platform for:**
- Reviews the book-level summary: how many clients are green / amber / red, how many escalations are open, average time-to-resolution
- Reads the cost funnel summary: how many signals were absorbed by the cheap filter vs. escalated to LLM reasoning — uses this as evidence of programme efficiency
- Pulls the append-only audit log during regulatory reviews: reconstructs any rating change from signal ingested → drift evaluated → alert → human action → outcome
- Reviews Markus's threshold-tuning decisions to ensure the bank's risk appetite is encoded correctly and documented

---

### Persona 4 — David, Internal Auditor (3rd Line of Defence)

**Role:** IT and Compliance Auditor
**Team:** Internal Audit, AMINA Bank
**Daily tools:** Audit management software, Risk Control Room (read-only audit log)

**Background:** David reviews the compliance programme end-to-end once or twice a year, and on-demand when a regulator or external auditor asks questions. He never operates the system — he only reads it. His job is to verify that the trail of actions is complete, tamper-evident, and that every decision was made with appropriate evidence and human authorisation.

**Goals:**
- Reconstruct any risk-rating change from first principles without asking anyone for context
- Verify that the AI system did not make autonomous decisions without a human approval gate
- Confirm that the cost decisions (why was or wasn't LLM reasoning used?) are documented

**Pain points before the platform:**
- Previous audit required emailing multiple people to piece together a decision chain
- No way to verify that AI outputs had been validated before acting on them
- Cost decisions were entirely implicit — no record of why a case was or wasn't escalated

**What he uses the platform for:**
- Reads the full append-only audit log for any client or time range
- For each risk-rating change, verifies the complete chain: signal provenance → drift tier and confidence → escalation trigger → alert (reasoning, citations, model version, token cost) → human action (analyst name, decision, rationale, timestamp) → outcome
- Confirms that the hash chain on the audit log has not been tampered with
- Reviews the false-positive and false-negative profile across the book to assess whether the 2nd line's detection strategy is sound

---

## User Flows

### Persona 1 - Flow 1

**Persona:** Sofia (Relationship Manager, 1st Line of Defence)
**Problem:** Sofia starts her day not knowing which of her ~80 clients drifted overnight. She needs to spot anything urgent without opening 80 individual dossiers.

**User Flow:**

**Current state:** Sofia logs in and lands on the Client Book View — a full list of her clients sorted by highest composite drift score first. Each row shows the client name, a risk tier badge (Low / Medium / High), and 6 small coloured squares for the drift axes (Sanctions · PEP exposure · Adverse media · Ownership clarity · Jurisdiction · Txn monitoring).

**Input:** Sofia scans the top of the list and spots "NewBird AI" with a red badge she didn't see yesterday. She clicks the row.

**Output:** She lands on the Client Detail View for NewBird AI. The drift vector shows Adverse media → red (high confidence), Ownership clarity → amber (medium confidence), the other four axes → green. An auto-generated alert card reads: "Adverse media axis crossed threshold — SEC 8-K and news coverage detected Apr 15 2026. Pattern match: Long Blockchain Corp (2017), base-rate outcome adverse. Recommended action: escalate to compliance for re-KYC." Citation links to the SEC filing and two EventRegistry news articles are shown inline. Sofia clicks "Escalate to Compliance", writes a one-line rationale, and submits. The action is written to the audit log with her name and timestamp. NewBird AI's badge in the book view updates to "Pending Review".

---

### Persona 1 - Flow 2

**Persona:** Sofia (Relationship Manager, 1st Line of Defence)
**Problem:** Sofia read a news article this morning mentioning one of her clients by name. She wants to pull up that client immediately without scrolling through the full list.

**User Flow:**

**Current state:** Sofia is on the Client Book View showing all ~80 clients. A search bar sits at the top of the list.

**Input:** Sofia types "Bit" into the search bar.

**Output:** The list filters in real time to three matching clients — "Bitfinex", "Bitcoin Suisse", "Bitstamp". Sofia clicks "Bitfinex". She lands on the Client Detail View and sees all 6 drift axes are green. The "Last checked: today, 06:00 UTC" timestamp confirms the system ran this morning. She returns to the book view.

---

### Persona 1 - Flow 3

**Persona:** Sofia (Relationship Manager, 1st Line of Defence)
**Problem:** Sofia has a call with Bitcoin Suisse in 10 minutes. She wants to check what the bank has on file and notices a website field she knows is outdated.

**User Flow:**

**Current state:** Sofia is on the Client Detail View for Bitcoin Suisse. All drift axes are green. She clicks the "KYC Profile" tab — a sibling tab to the Drift Vector — and sees all 14 KYC fields. Every field is green (no system-detected changes since onboarding). The "Last registry check" timestamp shows yesterday at 06:00 UTC.

**Input:** Sofia notices the Website field shows "bitcoinsuisse.com" with no subdomain. She knows from a recent call that the client launched a new institutional portal at a different URL. She clicks "Suggest Update" next to the Website field, types the new URL, adds a note ("Client mentioned new institutional portal on call, 18 Jun 2026"), and submits.

**Output:** The Website field shows an "Update pending review" tag. Markus receives a low-priority task in his escalation queue. When Markus approves it, the field is written to the KYC profile with a full attribution record: suggested by Sofia Meier (timestamp) → approved by Markus Bauer (timestamp), source note attached.

---

### Persona 1 - Flow 4

**Persona:** Sofia (Relationship Manager, 1st Line of Defence)
**Problem:** Sofia escalated NewBird AI to Markus earlier in the morning and wants to know whether he has reviewed it yet — without having to message him directly.

**User Flow:**

**Current state:** Sofia navigates to "My Activity" — a personal submissions view accessible from the top navigation bar. It lists all escalations and KYC field update suggestions she has submitted, each showing a status badge: Pending / Under Review / Approved / Rejected / Completed.

**Input:** She sees the NewBird AI escalation she submitted at 08:14, showing a "Pending" badge — meaning it has been assigned to Markus but not yet opened. She clicks the card.

**Output:** She sees the escalation in read-only view: her original rationale note, a snapshot of the drift vector as it looked when she submitted, and the current status — "Pending — assigned to Markus Bauer, not yet reviewed." There are no action buttons available to her at this stage. She closes the card and returns to her activity feed, knowing she does not need to follow up yet.

---

### Persona 1 - Flow 5

**Persona:** Sofia (Relationship Manager, 1st Line of Defence)
**Problem:** A direct sanctions hit was detected on one of Sofia's clients overnight. The system has already escalated it to Markus automatically — Sofia needs to understand why she cannot act on this alert herself.

**User Flow:**

**Current state:** Sofia opens the Client Book View for her morning review. She sees "Wirex Ltd" at the top of the list with a red badge and a lock icon she hasn't seen before. The Sanctions axis square is solid red. The client row shows a label: "System-escalated — floor trigger. Assigned to compliance."

**Input:** Sofia clicks the client row to understand what happened.

**Output:** She lands on the Client Detail View for Wirex Ltd. The Sanctions axis shows: score = 5 (floor trigger), source = OFAC SDN list match on beneficial owner (link), detected at 06:00 UTC. An informational banner reads: "This alert was automatically escalated to the 2nd line — floor triggers bypass 1st-line review. No action is required from you." There is no Escalate or Dismiss button. She can see the case is already in Markus's queue with a "Pending" status. She reads the source citation, closes the view, and continues her morning review.

---

### Persona 1 - Flow 6

**Persona:** Sofia (Relationship Manager, 1st Line of Defence)
**Problem:** Sofia receives a non-critical alert on a client she knows well. After reading the AI reasoning and the source, she believes it is a false positive and wants to dismiss it with a documented rationale.

**User Flow:**

**Current state:** Sofia is on the Client Detail View for "Copper Technologies". The Adverse media axis shows amber. An alert card reads: "Adverse media axis crossed watch threshold — 3 news articles mention regulatory scrutiny in the UK market. Confidence: 0.61. Recommended action: review and dismiss or escalate."

**Input:** Sofia reads the three linked news articles. She recognises the regulatory mention — it was a routine FCA consultation response that the client participated in publicly, not an enforcement action against them. She clicks "Dismiss", selects the dismissal reason from a dropdown ("Not material — misclassified signal"), and writes a rationale: "FCA mention is a public consultation response, not an enforcement or adverse finding. No escalation warranted." She submits.

**Output:** The alert is closed. The Adverse media axis on Copper Technologies returns to green. The audit log records: Sofia Meier, dismissal, timestamp, reason category, rationale text. The client's composite score is recalculated. In Sofia's "My Activity" feed the case shows as "Dismissed by you" with her rationale visible. The system notes the dismissal for false-positive rate tracking across the book.

---

### Persona 2 - Flow 1

**Persona:** Markus (AML/KYC Analyst, 2nd Line of Defence)
**Problem:** Markus receives an escalation from Sofia on NewBird AI. He needs to assess whether the drift is material enough to change the risk rating, and produce a decision record that satisfies regulators.

**User Flow:**

**Current state:** Markus opens the Risk Control Room and navigates to his Escalation Queue — a list of cases handed off from the 1st line or fired directly by floor triggers. He sees "NewBird AI — escalated by Sofia Meier, 08:14 today" at the top.

**Input:** Markus clicks the case. He reads Sofia's escalation note, then expands the Adverse media axis (red) and the Ownership clarity axis (amber) in the drift vector. The Adverse media axis shows a Stage 3 LLM output: a 3-paragraph explanation citing the SEC 8-K, a Wayback Machine diff of the company website, and a Crunchbase entry for the new GPU-as-a-Service product line — all linked. The pattern-library badge reads: "Matches Long Blockchain Corp (2017) — ended in SEC charges and delisting. Outcome prior: adverse." The Ownership clarity axis shows a new offshore BVI shareholder flagged by the system as a pending change awaiting human review. Markus reviews the OpenCorporates source and confirms it. He clicks "Confirm — Update Risk Rating", selects "High", writes a rationale referencing the SEC filing, the BVI ownership change, and the Long Blockchain pattern match, and submits.

**Output:** The audit log records: analyst = Markus Bauer, decision = risk-rating change Low → High, rationale, timestamp, model version, token cost of the Stage 3 call. Sofia receives a notification. NewBird AI's badge in the book view updates to "High Risk — Re-KYC Required".

---

### Persona 2 - Flow 2

**Persona:** Markus (AML/KYC Analyst, 2nd Line of Defence)
**Problem:** Before confirming the risk-rating change on NewBird AI, Markus wants to review the system's proposed KYC field updates, verify each one against the cited source, and decide which to approve or reject — so the KYC profile only reflects changes a human has validated.

**User Flow:**

**Current state:** Markus is on the Escalation Detail View for NewBird AI. He clicks the "KYC Profile" tab. He sees two panels: Current KYC Data on the left showing all currently approved field values, and Pending Changes on the right listing every update the system has flagged from public sources but not yet written to the profile. Four proposed changes are waiting for his review: Industry Sector, Main Shareholders, CEO, and Website. The full field set displayed is:

| Field | Source |
|---|---|
| Legal name (+ any aliases / prior names) | Zefix / GLEIF / OpenCorporates |
| LEI, registration number, legal form | GLEIF |
| Registered address, country of domicile | Zefix / OpenCorporates |
| Countries of activity | Onboarding data + registry |
| Industry sector | Onboarding data |
| Website (primary domain + any tracked subdomains) | Onboarding data + Wayback Machine / WHOIS |
| Crypto licence / regulatory classification | Onboarding data + news signals |
| Primary token / blockchain activity type | Onboarding data + on-chain signals |
| Main shareholders (>25%) | OpenCorporates / GLEIF |
| Beneficial owners | Onboarding data |
| CEO, CFO, Chairman | OpenCorporates / Crunchbase |
| Revenue, transaction volume thresholds | Onboarding data |
| Original risk tier at onboarding | Internal |
| Current risk tier + date of last full re-KYC | Internal |

**Input:** Markus clicks each pending change card. Each shows: the current approved value, the system's proposed new value, the source citation, and a confidence score. He opens the source link for each and verifies it. Industry Sector: proposed change from "Consumer Goods / Footwear" to "AI / Cloud Infrastructure", source SEC 8-K (link), confidence 0.91 — he clicks "Approve". Main Shareholders: proposed change to a new BVI entity, source OpenCorporates (link), confidence 0.84, OpenSanctions shows no match — he clicks "Approve". CEO: proposed change to Nadia Carlsten, source Crunchbase + press release (links), confidence 0.97 — he clicks "Approve". Website: proposed change from "allbirds.com" to "newbirdai.com", source WHOIS + Wayback Machine diff (links), confidence 0.99 — he clicks "Approve". For each approval he can optionally add a note; he leaves them blank and confirms.

**Output:** All four approved changes are written to the KYC profile. The Field Change History for each field now shows: original onboarding value (set manually by analyst Sarah K., Jan 2023) → proposed by system (timestamp, source, confidence) → approved by Markus Bauer (timestamp). No field has changed without a named human decision on record. Markus switches back to the Drift Vector tab and confirms the field-to-axis mapping: Industry Sector + Website → Adverse media axis (red); Main Shareholders + CEO → Ownership clarity axis (amber). He proceeds to "Confirm — Update Risk Rating" referencing all 4 approved field changes in his rationale.

---

### Persona 2 - Flow 3

**Persona:** Markus (AML/KYC Analyst, 2nd Line of Defence)
**Problem:** A new FINMA guidance note increases the weight that should be given to adverse media. Markus needs to update the detection policy so the Adverse media axis escalates more aggressively going forward.

**User Flow:**

**Current state:** Markus navigates to Settings → Detection Policy. He sees 6 axis weight sliders (Sanctions · PEP exposure · Adverse media · Ownership clarity · Jurisdiction · Txn monitoring), a composite escalation threshold dial, and a table showing the false-positive rate and Stage 2/3 escalation count per axis over the last 30 days.

**Input:** Markus locates the Adverse media axis row (current weight: 1.0), increases it to 1.4, and lowers the composite escalation threshold from 5.0 to 4.5. He clicks "Save and Apply". A confirmation modal reads: "This change will affect 3 customers currently below threshold — they will enter amber status. Review them now?" He clicks "Yes", reviews the 3 affected clients, and confirms.

**Output:** The updated thresholds are saved. The 3 affected clients move to amber status in the book view. The audit log records: Markus Bauer, threshold change, timestamp, before/after values for both the weight and the threshold.

---

### Persona 2 - Flow 4

**Persona:** Markus (AML/KYC Analyst, 2nd Line of Defence)
**Problem:** The system scored the Sanctions axis at 4 for a client, but after reviewing the source Markus determines it is a false positive — a name match on a different person. He needs to override the score, document his reasoning, and ensure the correction is fully traceable.

**User Flow:**

**Current state:** Markus is on the Escalation Detail View for the client. He expands the Sanctions axis row in the drift vector. He sees: system-computed score = 4, confidence = 0.76, source = OpenSanctions name match (link). He opens the source link and reads the entry — the matched individual shares the same name but has a different date of birth, nationality, and country of residence than the client's beneficial owner on file.

**Input:** Markus clicks "Override Score" next to the Sanctions axis. A modal opens showing the current system score (4) and a score input field. He sets the new score to 0, selects the override reason from a dropdown ("False positive — identity mismatch"), and writes a mandatory rationale note: "OpenSanctions match is a different individual — DOB, nationality, and country of residence do not match the beneficial owner on file. Name coincidence only." He confirms the override.

**Output:** The Sanctions axis updates to show: system score = 4 (struck through) → analyst override = 0, overridden by Markus Bauer (timestamp), rationale attached. The composite risk score recomputes with the corrected axis value. The audit log records both events as distinct entries: the original system score event (source, confidence, timestamp) and the analyst override event (old value, new value, rationale, analyst name, timestamp). The override is permanently visible alongside the original system score — it does not erase it.

---

### Persona 2 - Flow 5

**Persona:** Markus (AML/KYC Analyst, 2nd Line of Defence)
**Problem:** The system has detected a dormancy break on a client — a previously low-activity entity has suddenly begun processing high transaction volumes. No 1st-line escalation was involved; the system generated the ticket directly. Markus needs to assess whether this is legitimate business growth or suspicious activation.

**User Flow:**

**Current state:** Markus opens his Escalation Queue and sees a new system-generated ticket at the top: "Bitstamp Ltd — System escalation. Txn monitoring axis. Dormancy break detected." The label shows "Source: internal transaction data" and "No 1st-line action — auto-escalated by system." The ticket was created at 06:15 UTC after the daily monitoring run.

**Input:** Markus clicks the ticket. He sees the Txn monitoring axis in red: the system detected a 14× increase in monthly transaction volume over 3 weeks, from a 6-month baseline near zero. The Stage 2 LLM output reads: "Volume increase is inconsistent with the client's onboarded business profile (described as a low-frequency OTC desk). No corresponding public announcement of new product lines, funding, or regulatory approval. Pattern is consistent with dormancy break — suspicious activation archetype." Markus checks the KYC Profile tab: the onboarding transaction volume threshold was set at $500K/month; the last 3 weeks averaged $7.2M/month. He cross-references the Ownership clarity axis — it is green, no shareholder changes detected. He checks Adverse media — also green, no negative coverage. He decides the volume spike alone, without any corroborating signals, warrants a request for a client explanation before changing the risk rating. He clicks "Request Client Information", writes a note to Sofia ("Unusual transaction volume spike vs. onboarded profile — please request a business justification from the client by EOD"), and sets a 5-day follow-up deadline.

**Output:** The ticket status changes to "Awaiting client response — deadline Jun 25 2026." Sofia receives a task notification with Markus's note. The audit log records: system-generated escalation (Txn monitoring axis, dormancy break, timestamp, Stage 2 token cost) → Markus Bauer, action = "Request Client Information", rationale, deadline set. The Txn monitoring axis on Bitstamp remains amber pending resolution. If the deadline passes without a response, the system will automatically re-surface the case in Markus's queue as overdue.

---

### Persona 2 - Flow 6

**Persona:** Markus (AML/KYC Analyst, 2nd Line of Defence)
**Problem:** The system detected that a client changed its legal name overnight via a registry poll. This simultaneously triggers two parallel workflows: a KYC field update requiring human approval, and an automatic Sanctions re-screen under the new name. Markus needs to handle both.

**User Flow:**

**Current state:** Markus opens his Escalation Queue and sees a new system-generated ticket: "Allbirds Inc. — Legal name change detected. Re-screen completed." The ticket has two sections visible in the preview: a yellow "KYC field update pending approval" tag and a green "Sanctions re-screen: no match" tag. This is distinct from a floor-trigger ticket — no lock icon, no red badge — meaning the re-screen came back clean and the normal approval workflow applies.

**Input:** Markus clicks the ticket. He sees two parallel panels:

Panel 1 — **KYC Field Update (requires approval):** Legal name proposed change from "Allbirds, Inc." to "NewBird AI Inc.", source: SEC 8-K filing Apr 15 2026 + GLEIF registry update (links), confidence 0.99. The system notes any prior names are automatically added to the alias list for ongoing monitoring. Markus verifies the source, clicks "Approve", and the legal name field is updated in the KYC profile.

Panel 2 — **Sanctions Re-screen Result (informational):** "Automatic re-screen triggered by name change. New name 'NewBird AI Inc.' screened against OFAC SDN, EU Financial Sanctions Database, UN Security Council, OpenSanctions. Result: no match. Screened at 06:02 UTC. Prior name 'Allbirds, Inc.' remains on the alias monitoring list." No action required — Markus reads the result and notes it is clean.

**Output:** The KYC profile reflects the approved name change: Legal name = "NewBird AI Inc.", prior name "Allbirds, Inc." added to alias list. The Sanctions re-screen result is permanently attached to the name-change event in the audit log — any future regulator or auditor can see that a re-screen was run at the moment of the name change and what it returned. The audit log records: system-detected name change (source, timestamp) → Sanctions re-screen auto-fired (result: no match, timestamp) → Markus Bauer approved KYC field update (timestamp). If the re-screen had returned a match, a floor-trigger ticket would already have been in Markus's queue before he even saw this one.

---

### Persona 3 - Flow 1

**Persona:** Elena (MLRO / Head of Compliance, strategic oversight)
**Problem:** Elena has an upcoming FINMA audit and needs to produce a programme overview showing risk distribution across the book, cost efficiency of the AI pipeline, and a sample of fully traced decision chains.

**User Flow:**

**Current state:** Elena opens the Risk Control Room and navigates to the Programme Overview — a view accessible only to MLRO and above. She sees an executive summary panel: 82 total clients, risk distribution (70 Low / 8 Medium / 4 High), 2 open escalations, average time-to-resolution 4.2 hours (last 30 days).

**Input:** Elena clicks into the Cost Funnel section and reviews the waterfall chart: 18,400 signals ingested → 1,240 passed the cheap filter → 47 triggered Stage 2 → 9 triggered Stage 3. Estimated cost: $0.74/day vs. a naive full-LLM baseline of ~$190/day. She exports the chart as PDF. She then opens the Audit Log Explorer, filters by the last 90 days and event type "risk-rating changes", and clicks one result to expand the full decision chain.

**Output:** The decision chain displays as a timeline: signal ingested → drift evaluated → alert generated → Sofia's escalation → Markus's rating change → outcome. Elena confirms the chain is complete and exports it as a PDF for the FINMA submission.

---

### Persona 4 - Flow 1

**Persona:** David (Internal Auditor, 3rd Line of Defence)
**Problem:** A regulator has asked David to reconstruct the full decision trail for NewBird AI's risk-rating change from first principles — without asking anyone for context.

**User Flow:**

**Current state:** David opens the Risk Control Room in read-only audit mode. He has no action buttons — only the Audit Log Explorer and export tools are available to him.

**Input:** David searches the audit log for client = "NewBird AI", event type = "risk-rating change". One result appears. He clicks it.

**Output:** The full decision chain displays as a timestamped timeline: 06:00 — signal ingested (SEC 8-K, EventRegistry, Stage 1 cheap filter); 06:01 — Adverse media axis crossed threshold, escalated to Stage 3 (token cost: $0.023, model: Claude Opus 4); 06:02 — alert card generated (pattern match: Long Blockchain 2017, confidence: 0.87); 08:14 — Sofia Meier, 1st-line escalation (rationale attached); 09:03 — Markus Bauer, risk-rating change Low → High (rationale attached). Each log entry shows a green checkmark confirming hash integrity. David verifies no autonomous decision was made without a human approval gate, copies the audit log URL, and attaches it to his workpaper.