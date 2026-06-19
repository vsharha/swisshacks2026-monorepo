# Frontend — "Risk Control Room"

> See `product.md` for what the UI presents and `techstack.md` for the engine behind it.

## Direction

A **dark instrumentation terminal** — the authority of a trading-floor risk console, modernized. Dense, deliberate, greyscale, with risk as the only saturated colour. The product's conceptual spine: **drift is a signal deviating from a baseline over time**, and the UI is the instrument that reads it.

The design must satisfy a tension: trustworthy enough for a regulated bank (the 20% explainability score) *and* unforgettable in a 90-second pitch.

## Typography

- **Structure / labels:** Hanken Grotesk (fallback: Archivo) — tight, technical, confident.
- **Every number, score, ticker, token count, timestamp:** Commit Mono (fallback: JetBrains Mono). Mono numerals are the texture that sells "instrument."
- Hierarchy comes from weight + mono/grotesque contrast, not size inflation. Small, dense, deliberate.
- Avoid: Inter, Roboto, Arial, system fonts, Space Grotesk.

## Color tokens (dark)

```css
--bg:     #0A0B0D;  /* canvas */
--panel:  #121417;  /* panels */
--line:   #1F2329;  /* hairlines */
--text:   #E6E8EB;
--muted:  #6B7280;

/* Signal channel — the ONLY saturated colour in the UI */
--stable: #2DD4A7;  /* teal  */
--watch:  #FFB000;  /* amber */
--alert:  #FF3B30;  /* red   */
```

Everything outside the signal channel is greyscale, so an escalation visually screams.

## Layout — fixed control console, no scrolling for the main view

```
┌ AMINA · DRIFT MONITOR ───────────── ◐ LIVE ─ $0.75/day ┐
│ BOOK (4)        │ SMARTBIRD ▲ DRIFT 0.82  RE-KYC        │
│ ▸ Smartbird ███ │   business  ████████░ 0.9             │
│ ▸ Helvetia  ░   │   ownership ██████░░ 0.6              │
│ ▸ NordTrade ▒▒  │   radar ◢◣ deforming    geo ░ 0.1     │
│ ▸ Alpine AG ░   │                                       │
│ ────────────────┼ TIMELINE ▏▎▍▌▋▊▇█ ◀╋▶ scrub ──────── │
│ COST FUNNEL     │ Apr15 ● rename ● 8-K ● spike ● now    │
│ 50k→2k→200→5    │ ⚠ matches LONG BLOCKCHAIN 2017        │
└─────────────────┴───────────────────────────────────────┘
```

- **Left rail — the book:** ~4 customers, each with a tiny per-entity drift sparkbar.
- **Center — selected entity:** deforming **drift radar** (5 axes) + per-axis bars with confidence.
- **Right rail — live cost funnel:** 50k→2k→200→5 with running `$/day` + token meter.
- **Bottom — timeline / chart-recorder scrubber:** full-width, with real event dots.

## Hero moments (what wins the pitch)

1. **Scrub → radar deforms** in real time as drift accumulates, axis by axis, colour shifting teal → amber → red.
2. **Cost funnel ticks live** — 50k signals collapse to ~5 LLM calls while `$/day` stays near $0.75.
3. **Escalation flare** — when composite crosses threshold: the entity row + radar pulse red once, the **"⚠ matches Long Blockchain 2017"** badge snaps in, and the **RE-KYC alert** card slides up with citations + the human escalate/dismiss action (which writes to the audit log).

## Motion

Restrained, instrument-like:
- Hairline draw-ons; mono digits that **count up** (not fade).
- One decisive **pulse** on escalation.
- No bouncy easing — sharp, mechanical: `cubic-bezier(0.2, 0, 0, 1)`.
- Subtle scanline / noise overlay (~3% opacity) for CRT atmosphere — texture, not decoration.

## Principles

- Risk is the only colour; everything else earns attention through density and typography.
- Every number is mono; every claim is clickable to its citation.
- Legibility wins ties — this is a compliance tool first, a showpiece second.
