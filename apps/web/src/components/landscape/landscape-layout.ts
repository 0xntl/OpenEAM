// elkjs -> diagram-js glue: computes an automatic layout for a filtered
// building-block graph, then renders it into a bare diagram-js canvas (no
// palette/selection/modeling — pan/zoom only). Split out of the React
// wrapper so the pure data logic (edge filtering, layout) is testable
// without a DOM.
//
// hosted_on edges are containment ("runs on"), not a peer relationship like
// depends_on/data_flow — they become actual nesting (a box drawn inside
// another), not a connector line, via elk's hierarchical layout support.

import CoreModule from 'diagram-js/lib/core';
import Diagram from 'diagram-js/lib/Diagram';
import InteractionEventsModule from 'diagram-js/lib/features/interaction-events';
import MoveCanvasModule from 'diagram-js/lib/navigation/movecanvas';
import ZoomScrollModule from 'diagram-js/lib/navigation/zoomscroll';
import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import { preloadIcons } from '@/lib/icons';
import LandscapeRendererModule, { ensureArrowMarker } from './landscape-renderer';

export interface DiagramNode {
  id: string;
  label: string;
  kind: 'architecture' | 'solution';
  // Name of the block's primary (first) architecture domain — used to pick
  // a domain color/shape in the renderer. Undefined if no domain assigned.
  domainName?: string;
  // Iconify id of the block's model icon (see lib/icons.ts), drawn beside
  // the label. Undefined when none is set.
  icon?: string;
}

export type DiagramEdgeKind = 'depends_on' | 'data_flow' | 'hosted_on';

export interface DiagramEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: DiagramEdgeKind;
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 50;
const CONTAINER_PADDING = '[top=32,left=16,bottom=16,right=16]';

// Drops edges whose source or target isn't among the given nodes — a
// relationship or realization link can point at a block that the current
// viewpoint filter excluded, which would otherwise produce a dangling
// connection. Exported for unit testing without a DOM.
export function filterDanglingEdges(nodes: DiagramNode[], edges: DiagramEdge[]): DiagramEdge[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  return edges.filter((e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId));
}

// Builds a child -> parent map from hosted_on edges (source runs on
// target), first-wins per child (a node can only have one active hosted_on
// parent — enforced server-side, but a diagram without an as-of filter can
// still see multiple historical edges for the same source). Breaks cycles
// by dropping the offending parent link, so a malformed A-hosted_on-B,
// B-hosted_on-A never causes infinite recursion or a silently vanished node.
function buildParentMap(nodeIds: string[], hostedOnEdges: DiagramEdge[]): Map<string, string> {
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
// container that encloses *both* its endpoints — leaving it at the root
// when both endpoints are deeply nested produces edges with coordinates in
// the wrong frame (a real elk gotcha, not just a style preference). This
// walks each node's ancestor chain to find that container, or 'root' if the
// two endpoints don't share one (including the case where one endpoint IS
// the other's ancestor, which is rare enough here to just treat as root).
function lowestCommonContainer(aId: string, bId: string, parentOf: Map<string, string>): string {
  const aAncestors: string[] = [];
  for (
    let current: string | undefined = parentOf.get(aId);
    current;
    current = parentOf.get(current)
  ) {
    aAncestors.push(current);
  }
  const aAncestorSet = new Set(aAncestors);

  for (
    let current: string | undefined = parentOf.get(bId);
    current;
    current = parentOf.get(current)
  ) {
    if (aAncestorSet.has(current)) return current;
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

async function computeLayout(nodes: DiagramNode[], edges: DiagramEdge[]): Promise<ElkNode> {
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

  const elk = new ELK();
  return elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
    },
    children: buildContainmentTree(nodeIds, parentOf, edgesByContainer),
    edges: (edgesByContainer.get('root') ?? []).map((e) => ({
      id: e.id,
      sources: [e.sourceId],
      targets: [e.targetId],
    })),
  });
}

interface PositionedNode {
  shape: unknown;
  absX: number;
  absY: number;
}

export interface CanvasApi {
  addShape: (shape: unknown, parent?: unknown) => void;
  addConnection: (connection: unknown, parent: unknown) => void;
  getRootElement: () => unknown;
  getContainer: () => HTMLElement;
  zoom: (mode: string) => void;
  addMarker: (element: unknown, marker: string) => void;
  removeMarker: (element: unknown, marker: string) => void;
}

interface ElementFactoryApi {
  createShape: (attrs: Record<string, unknown>) => unknown;
  createConnection: (attrs: Record<string, unknown>) => unknown;
}

// Places every real node in the (possibly nested) elk tree, translating
// elk's parent-relative child coordinates into the absolute canvas
// coordinates diagram-js expects, and adds each shape under its logical
// diagram-js parent so paint order stacks containers behind their children.
function placeNodes(
  elkNode: ElkNode,
  offsetX: number,
  offsetY: number,
  diagramParent: unknown,
  nodeById: Map<string, DiagramNode>,
  elementFactory: ElementFactoryApi,
  canvas: CanvasApi,
  positioned: Map<string, PositionedNode>,
): void {
  const original = elkNode.id ? nodeById.get(elkNode.id) : undefined;
  let childOffsetX = offsetX;
  let childOffsetY = offsetY;
  let childParent = diagramParent;

  if (original && elkNode.id) {
    const absX = offsetX + (elkNode.x ?? 0);
    const absY = offsetY + (elkNode.y ?? 0);
    const isContainer = (elkNode.children?.length ?? 0) > 0;
    const shape = elementFactory.createShape({
      id: elkNode.id,
      x: absX,
      y: absY,
      width: elkNode.width ?? NODE_WIDTH,
      height: elkNode.height ?? NODE_HEIGHT,
      businessObject: { ...original, isContainer },
    });
    canvas.addShape(shape, diagramParent);
    positioned.set(elkNode.id, { shape, absX, absY });
    childOffsetX = absX;
    childOffsetY = absY;
    childParent = shape;
  }

  for (const child of elkNode.children ?? []) {
    placeNodes(
      child,
      childOffsetX,
      childOffsetY,
      childParent,
      nodeById,
      elementFactory,
      canvas,
      positioned,
    );
  }
}

// Walks the same tree looking for edge sections at every level — elk may
// return a cross-container edge nested under its lowest common ancestor
// rather than at the root, so this doesn't assume edges only ever live at
// the top level. Coordinates are translated the same way node positions are.
function placeEdges(
  elkNode: ElkNode,
  offsetX: number,
  offsetY: number,
  edgeById: Map<string, DiagramEdge>,
  positioned: Map<string, PositionedNode>,
  elementFactory: ElementFactoryApi,
  canvas: CanvasApi,
): void {
  for (const laidOutEdge of elkNode.edges ?? []) {
    if (!laidOutEdge.id) continue;
    const original = edgeById.get(laidOutEdge.id);
    if (!original) continue;
    const source = positioned.get(original.sourceId);
    const target = positioned.get(original.targetId);
    if (!source || !target) continue;

    // elk returns routed edges as `sections` (startPoint/bendPoints/endPoint),
    // not a flat list of points — a common gotcha when wiring elk into a
    // renderer that expects plain waypoints.
    const section = laidOutEdge.sections?.[0];
    const waypoints = section
      ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => ({
          x: offsetX + p.x,
          y: offsetY + p.y,
        }))
      : [
          { x: source.absX, y: source.absY },
          { x: target.absX, y: target.absY },
        ];

    const connection = elementFactory.createConnection({
      id: laidOutEdge.id,
      waypoints,
      source: source.shape,
      target: target.shape,
      businessObject: original,
    });
    canvas.addConnection(connection, canvas.getRootElement());
  }

  for (const child of elkNode.children ?? []) {
    placeEdges(
      child,
      offsetX + (child.x ?? 0),
      offsetY + (child.y ?? 0),
      edgeById,
      positioned,
      elementFactory,
      canvas,
    );
  }
}

// Builds and mounts a diagram-js canvas laid out by elk into `container`.
// Returns the live Diagram instance so the caller can destroy it on
// unmount/re-run, mirroring bpmn-viewer.tsx's lifecycle discipline.
export async function layoutAndRender(
  container: HTMLElement,
  nodes: DiagramNode[],
  rawEdges: DiagramEdge[],
): Promise<Diagram> {
  const edges = filterDanglingEdges(nodes, rawEdges);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edgeById = new Map(edges.map((e) => [e.id, e]));

  // The renderer draws synchronously, so the icons it will need are fetched
  // while elk computes the layout; a missing or slow icon never blocks it.
  const [layoutRoot] = await Promise.all([
    computeLayout(nodes, edges),
    preloadIcons(nodes.map((n) => n.icon)),
  ]);

  const diagram = new Diagram({
    canvas: { container },
    modules: [
      CoreModule,
      ZoomScrollModule,
      MoveCanvasModule,
      InteractionEventsModule,
      LandscapeRendererModule,
    ],
  });

  const canvas = diagram.get('canvas') as CanvasApi;
  const elementFactory = diagram.get('elementFactory') as ElementFactoryApi;

  const positioned = new Map<string, PositionedNode>();
  placeNodes(
    layoutRoot,
    0,
    0,
    canvas.getRootElement(),
    nodeById,
    elementFactory,
    canvas,
    positioned,
  );
  placeEdges(layoutRoot, 0, 0, edgeById, positioned, elementFactory, canvas);

  ensureArrowMarker(canvas.getContainer());
  canvas.zoom('fit-viewport');

  return diagram;
}
