import { describe, expect, it } from "vitest";
import {
  matchEntities,
  parseFeed,
  rssItemsToSignals,
  unwrapGoogleNewsUrl,
  type RssItem,
} from "./rss.ts";

const RSS_XML = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Test Feed</title>
  <item>
    <title>MicroStrategy buys more Bitcoin in fresh financing round</title>
    <link>https://example.com/mstr-btc</link>
    <pubDate>Mon, 15 Jun 2026 09:30:00 GMT</pubDate>
    <description>The company raised capital to fund treasury purchases.</description>
  </item>
  <item>
    <title>Unrelated weather report</title>
    <link>https://example.com/weather</link>
  </item>
</channel></rss>`;

const ATOM_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>FINMA opens probe into Gulf Bridge</title>
    <link rel="alternate" href="https://finma.example/probe"/>
    <published>2026-06-10T08:00:00Z</published>
    <summary>Regulator launches an investigation.</summary>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("parses RSS 2.0 items with title, link, date and summary", async () => {
    const items = await parseFeed(RSS_XML, "Test Feed");
    expect(items).toHaveLength(2);
    expect(items[0]!.title).toContain("MicroStrategy");
    expect(items[0]!.link).toBe("https://example.com/mstr-btc");
    expect(items[0]!.feed).toBe("Test Feed");
  });

  it("parses Atom entries with the alternate link href", async () => {
    const items = await parseFeed(ATOM_XML, "FINMA");
    expect(items).toHaveLength(1);
    expect(items[0]!.link).toBe("https://finma.example/probe");
    expect(items[0]!.pubDate).toBe("2026-06-10T08:00:00Z");
  });
});

describe("unwrapGoogleNewsUrl", () => {
  it("returns a non-Google URL unchanged", () => {
    expect(unwrapGoogleNewsUrl("https://example.com/a")).toBe("https://example.com/a");
  });

  it("uses a ?url= passthrough when present", () => {
    const u = "https://news.google.com/articles/abc?url=https%3A%2F%2Freal.example%2Fstory";
    expect(unwrapGoogleNewsUrl(u)).toBe("https://real.example/story");
  });

  it("decodes the embedded URL from an older base64 article id", () => {
    const embedded = "https://real.example/deep-link";
    const b64 = Buffer.from(`\x08\x13\x22${embedded}`, "latin1")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const u = `https://news.google.com/rss/articles/${b64}`;
    expect(unwrapGoogleNewsUrl(u)).toBe(embedded);
  });
});

describe("matchEntities", () => {
  const book = [
    { entityId: "strategy", name: "MicroStrategy Inc.", aliases: ["MicroStrategy", "MSTR"] },
    { entityId: "gulf", name: "Gulf Bridge Capital Ltd", aliases: ["Gulf Bridge", "GBC"] },
  ];

  it("matches an entity by alias as a whole token", () => {
    expect(matchEntities("MicroStrategy buys Bitcoin", book)).toEqual(["strategy"]);
  });

  it("matches multiple entities and ignores non-mentions", () => {
    expect(matchEntities("Gulf Bridge and MSTR both in the news", book).sort()).toEqual([
      "gulf",
      "strategy",
    ]);
    expect(matchEntities("nothing relevant here", book)).toEqual([]);
  });
});

describe("rssItemsToSignals", () => {
  it("normalizes items to rss signals, routing axis and date", async () => {
    const items = await parseFeed(RSS_XML, "Test Feed");
    const { signals, dropped } = rssItemsToSignals(items, "strategy", "2026-06-20");
    expect(dropped).toBe(0);
    expect(signals).toHaveLength(2);
    const financing = signals.find((s) => s.title.includes("MicroStrategy"))!;
    expect(financing.source).toBe("rss");
    expect(financing.axis).toBe("scale"); // "financing"/"capital" → scale
    expect(financing.date).toBe("2026-06-15T09:30:00.000Z");
  });

  it("falls back to asOf when an item has no parseable date", () => {
    const items: RssItem[] = [{ title: "No date here", link: "https://example.com/x" }];
    const { signals } = rssItemsToSignals(items, "e1", "2026-06-20");
    expect(signals[0]!.date).toBe("2026-06-20");
  });
});
