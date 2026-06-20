# Book globe — client-location overview (parked idea)

A monochrome 3D globe for the homepage's empty state, showing where every client
company in the book is located and doubling as a company selector.

## The idea

`apps/web/src/routes/+page.svelte` is a `240px / 1fr / 264px` grid: LeftRail book ·
EntityView · PatternRail. The center + right columns only render when a company is
selected (`{#if selected}`). When nothing is selected the right two-thirds are blank
— a natural "book overview" home state.

Fill it with a slowly-rotating monochrome globe:

- **Grayscale** to match the supervisory design system — slightly dark gray ocean,
  light gray land, faint neutral glow. Markers stay AMINA-teal so they pop.
- **One marker per company** at its HQ. Companies carry only an ISO-2 `jurisdiction`,
  so we map each `entityId` to a plausible HQ **city** (real HQs for the heroes;
  financial hubs for the synthetic entities). Cities (not country centroids) read as
  real places and separate same-country companies (2×CH, 2×US) without jitter.
- **Clickable markers** select a company (drill into the dashboard). Two viable
  mechanisms: (a) manual lat/lng→screen projection driving an HTML hotspot overlay of
  transparent `<button>`s, repositioned each frame from the rotation `phi` — works in
  all browsers; (b) cobe v2's CSS-anchor-positioned markers (`--cobe-<id>` /
  `--cobe-visible-<id>`) — much simpler but Chromium-only.
- **No companion legend.** Per later decision, selection lives in the existing left
  BookList; that list was enriched with a flag + city per row.

### HQ city lookup (reusable)

Lives in `apps/web/src/lib/view.ts` as `HQ` (entityId → {city, lat, lng}) and `FLAG`
(ISO-2 → emoji). **Kept in the codebase** because the BookList flag+city enrichment
uses it. Values:

| entityId            | name                 | juris | city          | lat, lng           |
| ------------------- | -------------------- | ----- | ------------- | ------------------ |
| alpine-components   | Alpine Components AG | CH    | Zurich        | 47.3769, 8.5417    |
| helvetia-trading    | Helvetia Trading AG  | CH    | Geneva        | 46.2044, 6.1432    |
| nordtrade-holding   | NordTrade Holding    | DE    | Frankfurt     | 50.1109, 8.6821    |
| gulf-bridge-capital | Gulf Bridge Capital  | AE    | Dubai         | 25.2048, 55.2708   |
| smartbird           | Allbirds, Inc.       | US    | San Francisco | 37.7749, -122.4194 |
| strategy            | MicroStrategy Inc.   | US    | Tysons, VA    | 38.9187, -77.2311  |

(Graduate to a `headquarters` field on `KYCBaselineSchema` if HQ becomes real data.
New entities without an HQ entry fall back to the jurisdiction code on the list.)
