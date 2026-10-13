// Read-only, auto-laid-out rendering of a building-block graph. Loaded
// lazily — diagram-js + elkjs are non-trivial payload — so this module must
// only be imported via React.lazy (see the landscape diagram route).
import type Diagram from 'diagram-js/lib/Diagram';
import 'diagram-js/assets/diagram-js.css';
import { useEffect, useRef, useState } from 'react';
import {
  type CanvasApi,
  type DiagramEdge,
  type DiagramNode,
  layoutAndRender,
} from './landscape-layout';

export type { DiagramEdge, DiagramEdgeKind, DiagramNode } from './landscape-layout';

// Highlight/dim markers toggled on hover — see the djs-element-* rules below
// this component's JSX. Kept out of landscape-renderer.ts because they're
// pure CSS state, not something BaseRenderer's drawShape/drawConnection need
// to know about.
const ACTIVE_MARKER = 'landscape-hover-active';
const CONNECTED_MARKER = 'landscape-hover-connected';
const DIMMED_MARKER = 'landscape-hover-dimmed';
const HOVER_MARKERS = [ACTIVE_MARKER, CONNECTED_MARKER, DIMMED_MARKER];

interface EventBusApi {
  on: (event: string, callback: (event: { element: RegisteredElement }) => void) => void;
  off: (event: string, callback: (event: unknown) => void) => void;
}

interface RegisteredElement {
  id: string;
  waypoints?: unknown;
  parent?: RegisteredElement;
}

interface ElementRegistryApi {
  getAll: () => RegisteredElement[];
  get: (id: string) => RegisteredElement | undefined;
}

// hosted_on containment nests a shape's <g> inside its parent's <g> in the
// SVG, and SVG group opacity compounds through nesting — dimming a
// container that happens to hold the hovered/connected node would fade that
// node too, on top of its own opacity. So ancestors of anything highlighted
// must be left at full opacity, even though they don't get the "connected"
// treatment themselves.
function ancestorIds(element: RegisteredElement | undefined): string[] {
  const ids: string[] = [];
  for (let current = element?.parent; current; current = current.parent) {
    ids.push(current.id);
  }
  return ids;
}

interface LandscapeDiagramProps {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  // Diagram-js has no built-in routing concept, so navigation on click is
  // left to the caller rather than baked in here.
  onNodeClick?: (nodeId: string) => void;
}

export default function LandscapeDiagram({ nodes, edges, onNodeClick }: LandscapeDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || nodes.length === 0) return;

    let destroyed = false;
    let diagram: Diagram | undefined;
    setError(null);

    // Edges directly touching each node, excluding hosted_on (never drawn as
    // a connection — it becomes containment, see landscape-layout.ts), so
    // hover can highlight "what talks to this block" without dead lookups.
    const neighborsByNode = new Map<string, { edgeIds: string[]; nodeIds: string[] }>();
    function addNeighbor(selfId: string, otherId: string, edgeId: string) {
      if (!neighborsByNode.has(selfId)) neighborsByNode.set(selfId, { edgeIds: [], nodeIds: [] });
      const entry = neighborsByNode.get(selfId);
      if (!entry) return;
      entry.edgeIds.push(edgeId);
      entry.nodeIds.push(otherId);
    }
    for (const edge of edges) {
      if (edge.kind === 'hosted_on') continue;
      addNeighbor(edge.sourceId, edge.targetId, edge.id);
      addNeighbor(edge.targetId, edge.sourceId, edge.id);
    }
    const edgeEndpoints = new Map(edges.map((e) => [e.id, [e.sourceId, e.targetId]]));
    // diagram-js fires element.hover/element.click for the empty canvas
    // itself too (its root element), not just real shapes/connections —
    // without this guard, moving the mouse over blank space would dim the
    // whole diagram as if hovering a (nonexistent) node.
    const realElementIds = new Set([...nodes.map((n) => n.id), ...edges.map((e) => e.id)]);

    layoutAndRender(container, nodes, edges)
      .then((d) => {
        if (destroyed) {
          d.destroy();
          return;
        }
        diagram = d;

        const canvas = d.get('canvas') as CanvasApi;
        // Show the whole landscape, however large; a fixed 1:1 scale clipped
        // anything past the first screen.
        canvas.zoom('fit-viewport');
        const eventBus = d.get('eventBus') as EventBusApi;
        const elementRegistry = d.get('elementRegistry') as ElementRegistryApi;

        function clearHover() {
          for (const el of elementRegistry.getAll()) {
            for (const marker of HOVER_MARKERS) canvas.removeMarker(el, marker);
          }
        }

        function handleHover({ element }: { element: RegisteredElement }) {
          if (!realElementIds.has(element.id)) return;
          const isConnection = element.waypoints !== undefined;
          const related = isConnection
            ? { edgeIds: [element.id], nodeIds: edgeEndpoints.get(element.id) ?? [] }
            : (neighborsByNode.get(element.id) ?? { edgeIds: [], nodeIds: [] });
          const highlighted = new Set([element.id, ...related.edgeIds, ...related.nodeIds]);

          const preserved = new Set(ancestorIds(element));
          for (const nodeId of related.nodeIds) {
            for (const ancestorId of ancestorIds(elementRegistry.get(nodeId))) {
              preserved.add(ancestorId);
            }
          }

          for (const el of elementRegistry.getAll()) {
            if (el.id === element.id) {
              canvas.addMarker(el, ACTIVE_MARKER);
            } else if (highlighted.has(el.id)) {
              canvas.addMarker(el, CONNECTED_MARKER);
            } else if (!preserved.has(el.id)) {
              canvas.addMarker(el, DIMMED_MARKER);
            }
          }
        }

        function handleClick({ element }: { element: RegisteredElement }) {
          if (!realElementIds.has(element.id)) return; // background/root
          if (element.waypoints !== undefined) return; // ignore edge clicks
          onNodeClick?.(element.id);
        }

        eventBus.on('element.hover', handleHover);
        eventBus.on('element.out', clearHover);
        eventBus.on('element.click', handleClick);
      })
      .catch((err: unknown) => {
        if (destroyed) return;
        setError(err instanceof Error ? err.message : 'Failed to render diagram');
      });

    // StrictMode double-invokes this effect in dev; without destroy() a
    // second diagram would stack a second canvas into the container.
    return () => {
      destroyed = true;
      diagram?.destroy();
    };
  }, [nodes, edges, onNodeClick]);

  if (nodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">No building blocks match this viewpoint.</p>
      </div>
    );
  }

  if (error) {
    return (
      <p className="p-4 text-xs text-destructive">Could not render landscape diagram: {error}</p>
    );
  }

  // Unlike the BPMN viewer/modeler (which force a light canvas because
  // bpmn-js's own default colors assume one), this renderer draws every
  // color from a themed CSS token (see index.css's --landscape-* block and
  // landscape-renderer.ts), so the surface itself can just follow the
  // app's normal card color and stay correct in both themes.
  return (
    <div className="landscape-diagram-surface h-full w-full bg-card">
      {/* Hover markers (see ACTIVE_MARKER/CONNECTED_MARKER/DIMMED_MARKER above)
          are plain CSS classes diagram-js adds to each element's <g> — styled
          here rather than in landscape-renderer.ts since they're hover state,
          not part of a node/edge's own drawn appearance. */}
      <style>{`
        .landscape-diagram-surface .djs-element { cursor: pointer; }
        /* diagram-js's core Canvas always makes its <svg> focusable and
           focuses it on every click, for a keyboard-pan feature this view
           doesn't even wire up (no Keyboard module in landscape-layout.ts's
           module list) — so the resulting focus ring around the whole
           diagram on every click serves no function here. This view is
           read-only and meant to feel like a stable surface, not an
           editor, so drop the ring unconditionally rather than trying to
           distinguish real keyboard focus from it. */
        .landscape-diagram-surface svg:focus {
          outline: none;
        }
        .landscape-diagram-surface .${ACTIVE_MARKER} .djs-visual > :first-child {
          stroke-width: 3px;
        }
        .landscape-diagram-surface .${CONNECTED_MARKER} .djs-visual > :first-child {
          stroke-width: 2.5px;
        }
        .landscape-diagram-surface .${DIMMED_MARKER} {
          opacity: 0.25;
        }
      `}</style>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
