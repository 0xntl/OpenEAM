// The landscape as data: which edges survive a viewpoint filter, how
// hosted_on becomes containment, and the elk layout that turns the graph
// into positions the canvas (landscape-flow.tsx) draws. No DOM and no React
// in here, so the whole thing is testable as plain functions.
//
// hosted_on edges are containment ("runs on"), not a peer relationship like
// depends_on or data_flow: a block drawn inside the block it runs on, not a
// line between the two. elk's hierarchical layout places the nested boxes;
// React Flow draws them as sub-flows.
import ELK, { type ELK as ElkInstance, type ElkNode } from 'elkjs/lib/elk-api.js';
import ElkWorker from 'elkjs/lib/elk-worker.min.js?worker';

export interface DiagramNode {
  id: string;
  label: string;
  kind: 'architecture' | 'solution';
  // Name of the block's primary (first) architecture domain, which picks
  // the node's colour and shape. Undefined when no domain is assigned.
  domainName?: string;
  // Iconify id of the block's model icon (D-22), drawn beside the label.
  icon?: string;
}

export type DiagramEdgeKind = 'depends_on' | 'data_flow' | 'hosted_on';

export interface DiagramEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: DiagramEdgeKind;
}

// Leaf node box. Containers take the size elk gives them from their content.
export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 56;
// Room for the container's own label row above its children.
const CONTAINER_PADDING = '[top=44,left=16,bottom=16,right=16]';

export interface Point {
  x: number;
  y: number;
}

// An edge with the orthogonal route elk found for it, in canvas coordinates
// (absolute, unlike node positions). Missing when elk returned no route.
export interface LaidOutEdge extends DiagramEdge {
  points?: Point[];
}

export interface LaidOutNode {
  id: string;
  // The container this node is drawn inside, from its hosted_on edge.
  parentId?: string;
  // Position relative to the parent container, or to the canvas at the top
  // level: the frame React Flow expects for nested nodes, and the one elk
  // reports, so no translation happens in between.
  x: number;
  y: number;
  width: number;
  height: number;
  isContainer: boolean;
}

// Drops edges whose source or target is not among the given nodes. A
// relationship can point at a block the current viewpoint filter excluded,
// which would otherwise be a dangling connection.
export function filterDanglingEdges(nodes: DiagramNode[], edges: DiagramEdge[]): DiagramEdge[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  return edges.filter((e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId));
}

// Builds a child -> parent map from hosted_on edges (source runs on
// target), first wins per child: a node has one active hosted_on parent
// (enforced server-side), but a diagram without an as-of filter can still
// see several historical edges for the same source. Breaks cycles by
// dropping the offending parent link, so a malformed A-hosted_on-B,
// B-hosted_on-A never recurses forever or silently loses a node.
export function buildParentMap(
  nodeIds: string[],
  hostedOnEdges: DiagramEdge[],
): Map<string, string> {
  const parentOf = new Map<string, string>();
  for (const e of hostedOnEdges) {
    if (!parentOf.has(e.sourceId)) parentOf.set(e.sourceId, e.targetId);
  }

  for (const id of nodeIds) {
    const seen = new Set<string>();
    let current = id;
    while (parentOf.has(current)) {
      if (seen.has(current)) {
        parentOf.delete(id);
        break;
      }
      seen.add(current);
      current = parentOf.get(current) as string;
    }
  }

  return parentOf;
}

// elk requires an edge to be declared in the `edges` list of the lowest
// container that encloses both its endpoints. Leaving it at the root when
// both endpoints are nested produces coordinates in the wrong frame. This
// walks each node's ancestor chain to find that container, or 'root' when
// the two endpoints share none (including one endpoint being the other's
// ancestor, rare enough here to treat as root).
function lowestCommonContainer(aId: string, bId: string, parentOf: Map<string, string>): string {
  const aAncestors = new Set<string>();
  for (
    let current: string | undefined = parentOf.get(aId);
    current;
    current = parentOf.get(current)
  ) {
    aAncestors.add(current);
  }
  for (
    let current: string | undefined = parentOf.get(bId);
    current;
    current = parentOf.get(current)
  ) {
    if (aAncestors.has(current)) return current;
  }
  return 'root';
}

function buildContainmentTree(
  nodeIds: string[],
  parentOf: Map<string, string>,
  edgesByContainer: Map<string, DiagramEdge[]>,
): ElkNode[] {
  const childrenOf = new Map<string, string[]>();
  for (const [child, parent] of parentOf) {
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent)?.push(child);
  }

  const toElkEdge = (e: DiagramEdge) => ({
    id: e.id,
    sources: [e.sourceId],
    targets: [e.targetId],
  });

  function buildNode(id: string): ElkNode {
    const kids = childrenOf.get(id) ?? [];
    if (kids.length === 0) {
      return { id, width: NODE_WIDTH, height: NODE_HEIGHT };
    }
    return {
      id,
      layoutOptions: { 'elk.padding': CONTAINER_PADDING },
      children: kids.map(buildNode),
      edges: (edgesByContainer.get(id) ?? []).map(toElkEdge),
    };
  }

  return nodeIds.filter((id) => !parentOf.has(id)).map(buildNode);
}

// Flattens elk's tree into React Flow's list, parents before their
// children (React Flow requires that order for nested nodes).
function flattenNodes(elkNode: ElkNode, parentId: string | undefined, out: LaidOutNode[]): void {
  for (const child of elkNode.children ?? []) {
    if (!child.id) continue;
    out.push({
      id: child.id,
      parentId,
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: child.width ?? NODE_WIDTH,
      height: child.height ?? NODE_HEIGHT,
      isContainer: (child.children?.length ?? 0) > 0,
    });
    flattenNodes(child, child.id, out);
  }
}

// Collects the routes elk found, at every level of the tree: an edge
// between nested nodes lives under their lowest common container, with its
// coordinates relative to that container, so each level's offset is added
// on the way down. elk returns a route as `sections` (start, bends, end),
// not a flat point list; only the first section is used, which is all an
// edge without hyperedge joins ever has.
function collectRoutes(
  elkNode: ElkNode,
  offsetX: number,
  offsetY: number,
  routes: Map<string, Point[]>,
): void {
  for (const edge of elkNode.edges ?? []) {
    const section = edge.sections?.[0];
    if (!edge.id || !section) continue;
    routes.set(
      edge.id,
      [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => ({
        x: offsetX + p.x,
        y: offsetY + p.y,
      })),
    );
  }
  for (const child of elkNode.children ?? []) {
    collectRoutes(child, offsetX + (child.x ?? 0), offsetY + (child.y ?? 0), routes);
  }
}

// elk runs in a web worker: the layout of a few hundred blocks takes long
// enough to stall the UI otherwise, and the worker build keeps elk's ~1 MB
// out of the main bundle. One worker serves every layout.
let elkInstance: ElkInstance | undefined;
function elk(): ElkInstance {
  elkInstance ??= new ELK({ workerFactory: () => new ElkWorker() });
  return elkInstance;
}

// Lays the graph out left to right with hosted_on as nesting, and routes
// the edges orthogonally around the boxes. The canvas draws those routes
// as long as the nodes stay where elk put them; once someone drags a node,
// its edges fall back to a route computed from the node positions.
export async function computeLayout(
  nodes: DiagramNode[],
  rawEdges: DiagramEdge[],
): Promise<{ nodes: LaidOutNode[]; edges: LaidOutEdge[] }> {
  const edges = filterDanglingEdges(nodes, rawEdges);
  const hostedOnEdges = edges.filter((e) => e.kind === 'hosted_on');
  const otherEdges = edges.filter((e) => e.kind !== 'hosted_on');
  const nodeIds = nodes.map((n) => n.id);
  const parentOf = buildParentMap(nodeIds, hostedOnEdges);

  const edgesByContainer = new Map<string, DiagramEdge[]>();
  for (const e of otherEdges) {
    const container = lowestCommonContainer(e.sourceId, e.targetId, parentOf);
    if (!edgesByContainer.has(container)) edgesByContainer.set(container, []);
    edgesByContainer.get(container)?.push(e);
  }

  const root = await elk().layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '40',
      'elk.spacing.edgeNode': '24',
      'elk.spacing.edgeEdge': '12',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90',
      'elk.layered.spacing.edgeNodeBetweenLayers': '30',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '12',
      'elk.spacing.componentComponent': '60',
    },
    children: buildContainmentTree(nodeIds, parentOf, edgesByContainer),
    edges: (edgesByContainer.get('root') ?? []).map((e) => ({
      id: e.id,
      sources: [e.sourceId],
      targets: [e.targetId],
    })),
  });

  const laidOut: LaidOutNode[] = [];
  flattenNodes(root, undefined, laidOut);
  const routes = new Map<string, Point[]>();
  collectRoutes(root, 0, 0, routes);
  return {
    nodes: laidOut,
    edges: edges.map((e) => ({ ...e, points: routes.get(e.id) })),
  };
}
