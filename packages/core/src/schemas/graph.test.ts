import { describe, expect, it } from "vitest";
import {
  GraphEdgeSchema,
  GraphNodeSchema,
  RelationshipPathSchema,
  RiskGraphSchema,
} from "./graph.ts";
import { AlertSchema } from "./alert.ts";

describe("graph schemas", () => {
  it("parses a node, an edge and a graph", () => {
    const node = GraphNodeSchema.parse({ id: "org:e1", type: "entity", label: "E1" });
    const edge = GraphEdgeSchema.parse({ from: "person:p", to: "org:e1", type: "CONTROLS" });
    const graph = RiskGraphSchema.parse({ nodes: [node], edges: [edge] });
    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges[0]!.type).toBe("CONTROLS");
  });

  it("rejects an unknown edge type", () => {
    expect(() =>
      GraphEdgeSchema.parse({ from: "a", to: "b", type: "FRIENDS_WITH" }),
    ).toThrow();
  });

  it("requires a relationship path to have at least two nodes", () => {
    expect(() =>
      RelationshipPathSchema.parse({
        nodes: [{ id: "org:e1", label: "E1", type: "entity" }],
        edges: [],
      }),
    ).toThrow();
  });

  it("parses a two-hop relationship path", () => {
    const path = RelationshipPathSchema.parse({
      nodes: [
        { id: "org:e1", label: "E1", type: "entity" },
        { id: "org:caspian", label: "Caspian", type: "investor" },
        { id: "person:p", label: "P", type: "individual" },
      ],
      edges: ["OWNS", "CONTROLS"],
    });
    expect(path.edges).toHaveLength(2);
  });
});

describe("AlertSchema.relationshipPaths", () => {
  const baseAlert = {
    id: "a1",
    entityId: "e1",
    createdAt: "2026-06-20T00:00:00Z",
    composite: 0.8,
    status: "alert",
    triggeringAxes: ["ownership"],
    recommendedAction: "review",
    reasoning: "because",
    citations: [{ sourceUrl: "https://example.com/x", title: "x" }],
    confidence: 0.9,
    modelVersion: "test",
  };

  it("defaults relationshipPaths to an empty array (back-compat)", () => {
    const alert = AlertSchema.parse(baseAlert);
    expect(alert.relationshipPaths).toEqual([]);
  });

  it("accepts attached relationship paths", () => {
    const alert = AlertSchema.parse({
      ...baseAlert,
      relationshipPaths: [
        {
          nodes: [
            { id: "org:e1", label: "E1", type: "entity" },
            { id: "person:p", label: "P", type: "individual" },
          ],
          edges: ["CONTROLS"],
        },
      ],
    });
    expect(alert.relationshipPaths).toHaveLength(1);
  });
});
