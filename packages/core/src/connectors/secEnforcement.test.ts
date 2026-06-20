import { describe, expect, it } from "vitest";
import { enforcementToSignals } from "./secEnforcement.ts";
import { parseFeed, type EntityMatcher } from "./rss.ts";

const FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
  <title>Administrative Proceedings</title>
  <item>
    <title>NordTrade Holding and a director</title>
    <link>https://www.sec.gov/files/litigation/admin/2026/34-105730.pdf</link>
    <description>NordTrade Holding</description>
    <pubDate>Thu, 18 Jun 2026 11:07:45 -0400</pubDate>
  </item>
  <item>
    <title>Some Unrelated Respondent, LLC</title>
    <link>https://www.sec.gov/files/litigation/admin/2026/34-105724.pdf</link>
    <pubDate>Wed, 17 Jun 2026 19:52:12 -0400</pubDate>
  </item>
</channel></rss>`;

const matchers: EntityMatcher[] = [
  { entityId: "nordtrade-holding", name: "NordTrade Holding", aliases: ["NordTrade"] },
  { entityId: "strategy", name: "MicroStrategy Inc.", aliases: ["MicroStrategy", "MSTR"] },
];

describe("enforcementToSignals", () => {
  it("emits a regulator-grade reputation signal for a matched respondent", async () => {
    const items = await parseFeed(FEED, "SEC Administrative Proceedings");
    const { signals, dropped } = enforcementToSignals(items, matchers, "2026-06-20");
    expect(dropped).toBe(0);
    expect(signals).toHaveLength(1);
    const s = signals[0]!;
    expect(s.entityId).toBe("nordtrade-holding");
    expect(s.axis).toBe("reputation");
    expect(s.type).toBe("enforcement_action");
    expect(s.source).toBe("sec_edgar");
    expect(s.confidence).toBeGreaterThanOrEqual(0.9);
    expect(s.date).toBe("2026-06-18T15:07:45.000Z");
  });

  it("ignores releases that match no book entity", async () => {
    const items = await parseFeed(FEED, "SEC");
    const onlyStrategy = enforcementToSignals(items, [matchers[1]!], "2026-06-20");
    expect(onlyStrategy.signals).toEqual([]);
  });
});
