import { describe, expect, it } from "vitest";
import { gleifToOwnershipEdges, GleifRelationshipSchema } from "./gleif.ts";

describe("gleifToOwnershipEdges", () => {
  it("maps a consolidation relationship to a parent→child CONTROLS edge", () => {
    const records = [
      GleifRelationshipSchema.parse({
        childName: "Alpine Components AG",
        parentName: "Alpine Holding SA",
        parentLei: "5299000ALPINE000HOLD",
        relationshipType: "IS_ULTIMATELY_CONSOLIDATED_BY",
        sourceUrl: "https://search.gleif.org/",
      }),
    ];
    const edges = gleifToOwnershipEdges(records);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      from: "org:alpine holding sa",
      to: "org:alpine components ag",
      type: "CONTROLS",
    });
    expect(edges[0]!.note).toContain("GLEIF");
  });
});
