# AMINA Design System — "Supervisory"

> The dashboard in AMINA Bank's own visual language, adapted for a risk/compliance instrument. Replaces the earlier dark "Risk Control Room" terminal direction for chrome, palette, and type; the drift radar, 5-axis rigor, and mono data carry over unchanged.

Tokens here are **measured from aminagroup.com** (captured 2026-06-20), not invented. The goal: a compliance officer should believe AMINA's own team shipped this.

## Direction

A **light, Swiss-modern supervisory dashboard** — the opposite of a trading terminal. White canvas, generous whitespace, near-black ink, teal as the brand action colour, and one deep "galaxy" device for drama. Calm by default; the book of customers reads as a serene register. Authority comes from restraint, precise hairlines, and document-grade legibility — which is also what scores the explainability (20%) and compliance (20%) criteria.

The single most important rule: **the brand colour is not a risk signal.** AMINA's teal means "AMINA," not "all clear." Risk lives in a separate channel.

## Colour tokens

```css
:root {
  /* Surfaces — light */
  --bg:       #F9FAFB;  /* canvas / book register      */
  --panel:    #FFFFFF;  /* cards sit above the canvas  */
  --panel-2:  #F3F4F6;  /* nested / inset fills        */
  --line:     #E5E7EB;  /* hairlines                   */
  --line-2:   #D1D5DB;  /* stronger rules              */

  /* Ink */
  --text:     #111827;  /* primary ink (gray-900)      */
  --text-2:   #374151;  /* body                        */
  --muted:    #6B7280;  /* captions / labels           */

  /* Brand — interactive ONLY (logo, selection, links, primary action) */
  --brand:    #14B8A6;  /* AMINA teal (--main-color)   */
  --brand-ink:#0F766E;  /* teal text on light          */
  --galaxy:   #0D2936;  /* deep petrol — the signature dark device */
  --galaxy-2: #003D4C;  /* deeper teal for galaxy gradients        */

  /* Risk signal channel — separate from brand, escalation only */
  --stable:   #6B7280;  /* quiet neutral: no colour = no attention */
  --watch:    #F59E0B;  /* amber                                   */
  --alert:    #FA4616;  /* AMINA orange-red — the escalation pop    */
  --alert-deep:#C2410C; /* pressed / deepened alert                */

  --radius:   0.5rem;   /* AMINA uses soft 8px corners */
}
```

**Why `--stable` is grey, not teal.** In the old terminal, teal meant "stable." AMINA's brand *is* teal, so reusing it for "stable" makes the brand read as "all clear" and the dashboard fights itself. Stable customers get **no colour at all** — which is exactly the product story: the cheap tiers absorb the quiet book so attention only goes where a baseline is moving.

### On dark (the galaxy escalation card)

When a panel flips to the galaxy treatment, invert:

```css
--bg:    #0D2936;  --panel: #102A33; /* raised surface */
--text:  #F1F5F7;  --muted: #7FA3AB;
--line:  rgba(255,255,255,0.08);
/* brand + risk channel keep their hues; they pop harder on galaxy */
```

## Typography

AMINA pairs a **slab serif** headline with a **geometric grotesque** body. We keep mono for data.

- **Verdicts & headlines — Bitter** (slab serif). The Re-KYC verdict, customer name, section titles. Bitter gives the "signed opinion" gravity; use it sparingly and large.
- **Labels, eyebrows, body — Satoshi** (geometric grotesque). Tight uppercase tracking for eyebrows; sentence case for body.
- **All numbers, scores, tokens, timestamps, citations — mono** (JetBrains Mono / Commit Mono). Unchanged from the terminal — the mono numerals are the instrument rigor that survives the reskin. Keep `font-feature-settings: 'tnum' 1`.

Hierarchy from weight + serif/sans/mono contrast, not size inflation.

```css
@theme inline {
  --font-display: 'Bitter', Georgia, serif;        /* verdicts        */
  --font-sans:    'Satoshi', 'Hanken Grotesk', sans-serif;
  --font-mono:    'JetBrains Mono Variable', monospace;
}
```

Fonts: Satoshi via Fontshare, Bitter via `@fontsource/bitter`. Avoid Inter, Roboto, Arial, system fonts.

## Components

- **Eyebrow pills** — rounded-full, pale-teal outline border, teal text. AMINA's signature label device. Use for axis tags and section eyebrows.
- **Primary button** — solid `--brand` teal, white text, `--radius` corners. One per view (the human-in-the-loop action: *Escalate*).
- **Secondary button** — white fill, `--line-2` hairline border, ink text (*Dismiss*).
- **Cards** — white on `--bg`, 1px `--line`, `--radius`, generous padding. No heavy shadows; a single soft `6px 6px 9px rgba(0,0,0,0.06)` only on the floating galaxy card.
- **Register rows** — ruled list, hairline separators, mono drift score right-aligned. Selected row: teal left-border + `--panel-2` fill.

## Signature — the galaxy escalation card

AMINA's site floats deep `#0D2936` feature cards on white. Apply it literally as the hero moment:

The book stays a **calm light register**. When a customer's composite crosses threshold, **that one case file flips to galaxy-dark** — the drift radar glows inside it, the verdict sets in Bitter, the "matches Long Blockchain 2017" stamp snaps in, and the Re-KYC action appears. The serene white book + the one dark, serious case file = the whole pitch in a single frame, told entirely in AMINA's own materials.

## Motion

Restrained, instrument-like (carried from the terminal, minus the CRT):

- Hairlines draw on; mono digits **count up** (not fade).
- **One decisive beat** on escalation: the case card flips to galaxy with a sharp `cubic-bezier(0.2, 0, 0, 1)` and a single press-in of the verdict stamp.
- No bouncy easing. **Drop the CRT scanline / noise** — that is terminal idiom, off-brand for AMINA's clean light surfaces.
- Respect `prefers-reduced-motion`: keep the colour/state change, drop the press animation.

## Principles

- The brand colour is interactive, never a risk verdict. Risk is its own channel; stable is colourless.
- Light and calm by default; the galaxy card is the only place the UI raises its voice.
- Every number is mono; every claim is clickable to its citation.
- Legibility wins ties — a supervisory record first, a showpiece second.
