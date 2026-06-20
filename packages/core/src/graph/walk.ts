import {
  RelationshipPathSchema,
  type GraphEdgeType,
  type GraphNode,
  type RelationshipPath,
  type RiskGraph,
} from "../schemas/index.ts";

/**
 * Walk the relationship graph (proposals 3 + 5). Edges are treated as
 * **undirected** for reachability — risk flows along a control link in either
 * direction (a sanctioned controller taints what it controls, and a tainted
 * entity implicates its controllers) — while each step keeps its edge *type* for
 * explainability. All output is deterministic (sorted adjacency, BFS shortest
 * path), so the offline script and the tests repeat exactly.
 */

interface Adjacency {
  byId: Map<string, GraphNode>;
  out: Map<string, { id: string; type: GraphEdgeType }[]>;
}

function adjacency(graph: RiskGraph): Adjacency {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out = new Map<string, { id: string; type: GraphEdgeType }[]>();
  const add = (from: string, to: string, type: GraphEdgeType) => {
    if (!out.has(from)) out.set(from, []);
    out.get(from)!.push({ id: to, type });
  };
  for (const e of graph.edges) {
    add(e.from, e.to, e.type);
    add(e.to, e.from, e.type);
  }
  // Deterministic neighbour order.
  for (const list of out.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  return { byId, out };
}

/** Nodes adjacent to `nodeId` (undirected), each with the connecting edge type. */
export function neighbors(
  graph: RiskGraph,
  nodeId: string,
): { id: string; type: GraphEdgeType; node: GraphNode | undefined }[] {
  const { byId, out } = adjacency(graph);
  return (out.get(nodeId) ?? []).map((n) => ({ id: n.id, type: n.type, node: byId.get(n.id) }));
}

function toPath(byId: Map<string, GraphNode>, ids: string[], edges: GraphEdgeType[]): RelationshipPath {
  return RelationshipPathSchema.parse({
    nodes: ids.map((id) => {
      const n = byId.get(id);
      return { id, label: n?.label ?? id, type: n?.type ?? "entity" };
    }),
    edges,
  });
}

/**
 * Shortest relationship path from `startId` to every node matching `isTarget`,
 * within `maxDepth` hops (edges). BFS, so the first time a node is reached is its
 * shortest path; a target node terminates its branch (risk is read at the node it
 * reaches, not beyond it). `startId` itself is never a target.
 */
export function findPaths(
  graph: RiskGraph,
  startId: string,
  isTarget: (node: GraphNode) => boolean,
  maxDepth = 3,
): RelationshipPath[] {
  const { byId, out } = adjacency(graph);
  if (!byId.has(startId)) return [];

  const visited = new Set<string>([startId]);
  const queue: { id: string; nodes: string[]; edges: GraphEdgeType[] }[] = [
    { id: startId, nodes: [startId], edges: [] },
  ];
  const paths: RelationshipPath[] = [];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const node = byId.get(cur.id);
    if (cur.edges.length > 0 && node && isTarget(node)) {
      paths.push(toPath(byId, cur.nodes, cur.edges));
      continue; // terminal — do not expand past a risk node.
    }
    if (cur.edges.length >= maxDepth) continue;
    for (const next of out.get(cur.id) ?? []) {
      if (visited.has(next.id)) continue;
      visited.add(next.id);
      queue.push({ id: next.id, nodes: [...cur.nodes, next.id], edges: [...cur.edges, next.type] });
    }
  }
  return paths;
}

/**
 * Other `entity` nodes reachable from `entityId` within `maxDepth` hops, each
 * with its shortest relationship path — the propagation frontier (proposal 5).
 */
export function connectedEntities(
  graph: RiskGraph,
  entityId: string,
  maxDepth = 2,
): { entityId: string; node: GraphNode; path: RelationshipPath }[] {
  return findPaths(graph, entityId, (n) => n.type === "entity" && n.id !== entityId, maxDepth).map(
    (path) => {
      const last = path.nodes[path.nodes.length - 1]!;
      return { entityId: last.id, node: { id: last.id, type: last.type, label: last.label }, path };
    },
  );
}
