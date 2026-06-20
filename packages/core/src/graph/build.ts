import {
  RiskGraphSchema,
  type BeneficialOwner,
  type GraphEdge,
  type GraphEdgeType,
  type GraphNode,
  type GraphNodeType,
  type KYCBaseline,
  type RiskGraph,
} from "../schemas/index.ts";

/**
 * Build the relationship graph (proposal 3) from the customer book. Nodes are
 * entities, the people / vehicles that own or control them, and the countries
 * they touch; edges are typed ownership / control / investment / board / domicile
 * links. A shared owner appears once, so two entities that share a controller are
 * connected — the seam hidden-controller detection and propagation walk over.
 *
 * Pure and deterministic: it takes the baselines plus an optional `extraEdges`
 * array (registry-style links the baselines can't express on their own, e.g. a
 * GLEIF / OpenCorporates control link), and returns sorted nodes and edges.
 */

/** Org-like owner names → an `entity` node; everything else → `individual`. */
const ORG_PATTERN =
  /\b(ltd|limited|llc|inc|incorporated|corp|corporation|co|sa|ag|gmbh|plc|holding|holdings|group|partners|capital|nominees|trust|fund|sarl|bv|nv)\b|&/i;

/** Stable, namespaced node id. `person:`/`org:`/`country:` keyed on the type. */
export function nodeIdFor(name: string, type: GraphNodeType): string {
  const normalized = name.toLowerCase().replace(/\s+/g, " ").trim();
  if (type === "country") return `country:${normalized}`;
  if (type === "individual") return `person:${normalized}`;
  if (type === "wallet") return `wallet:${normalized}`;
  return `org:${normalized}`;
}

/** An owner that names an organization is an `entity` node, else `individual`. */
function ownerNodeType(owner: BeneficialOwner): GraphNodeType {
  return ORG_PATTERN.test(owner.name) ? "entity" : "individual";
}

/** Map an owner's role/share to a typed edge (owner → entity). */
function ownerEdgeType(owner: BeneficialOwner): GraphEdgeType {
  const role = (owner.role ?? "").toLowerCase();
  if (/board|director|chair/.test(role)) return "BOARD_MEMBER_OF";
  if ((owner.share ?? 0) >= 0.5 || /parent|majority|controll|ultimate|nominee/.test(role)) {
    return "CONTROLS";
  }
  if (/invest/.test(role)) return "INVESTED_IN";
  return "OWNS";
}

/** Infer a placeholder node's type from its id namespace. */
function typeFromId(id: string): GraphNodeType {
  if (id.startsWith("country:")) return "country";
  if (id.startsWith("org:")) return "entity";
  if (id.startsWith("wallet:")) return "wallet";
  return "individual";
}

/** Strip the namespace and title-case a placeholder label from its id. */
function labelFromId(id: string): string {
  const raw = id.slice(id.indexOf(":") + 1);
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildGraph(baselines: KYCBaseline[], extraEdges: GraphEdge[] = []): RiskGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  const addNode = (node: GraphNode) => {
    const existing = nodes.get(node.id);
    // Keep the richest record: prefer a real label / country over a placeholder.
    if (!existing) nodes.set(node.id, node);
    else nodes.set(node.id, { ...existing, ...node, country: node.country ?? existing.country });
  };

  for (const b of baselines) {
    const entityId = nodeIdFor(b.name, "entity");
    addNode({ id: entityId, type: "entity", label: b.name, country: b.jurisdiction });

    // Domicile.
    const countryId = nodeIdFor(b.jurisdiction, "country");
    addNode({ id: countryId, type: "country", label: b.jurisdiction, country: b.jurisdiction });
    edges.push({ from: entityId, to: countryId, type: "OPERATES_IN" });

    // Owners / controllers / investors / board.
    for (const owner of b.beneficialOwners) {
      const type = ownerNodeType(owner);
      const ownerId = nodeIdFor(owner.name, type);
      addNode({ id: ownerId, type, label: owner.name, country: owner.nationality });
      edges.push({
        from: ownerId,
        to: entityId,
        type: ownerEdgeType(owner),
        weight: owner.share,
      });
    }
  }

  // Registry-style links the book can't express; create any missing endpoints.
  for (const edge of extraEdges) {
    for (const id of [edge.from, edge.to]) {
      if (!nodes.has(id)) addNode({ id, type: typeFromId(id), label: labelFromId(id) });
    }
    edges.push(edge);
  }

  const sortedNodes = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  const sortedEdges = edges.sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.type.localeCompare(b.type),
  );

  return RiskGraphSchema.parse({ nodes: sortedNodes, edges: sortedEdges });
}
