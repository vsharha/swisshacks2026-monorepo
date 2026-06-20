import { describe, expect, it } from "vitest";
import { resolveEntities, type NerMatcher } from "./ner.ts";
import type { EntityMatcher } from "./rss.ts";

const book: EntityMatcher[] = [
  { entityId: "strategy", name: "MicroStrategy Inc.", aliases: ["MicroStrategy", "MSTR"] },
];

describe("resolveEntities", () => {
  it("uses the cheap matcher by default", async () => {
    expect(await resolveEntities("MSTR added to the index", book)).toEqual(["strategy"]);
    expect(await resolveEntities("a generic analytics firm", book)).toEqual([]);
  });

  it("broadens recall with an injected NER matcher and unions the results", async () => {
    // The literal scan misses this paraphrase; the NER pass names the company.
    const ner: NerMatcher = { detect: async () => ["MicroStrategy"] };
    const text = "the Delaware analytics-software company expanded its treasury";
    expect(await resolveEntities(text, book)).toEqual([]);
    expect(await resolveEntities(text, book, { ner })).toEqual(["strategy"]);
  });
});
