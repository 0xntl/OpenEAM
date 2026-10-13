// The landscape canvas: React Flow drawing the graph that landscape-graph.ts
// laid out with elk (D-25). Nodes are React components, so model icons,
// tooltips and theme tokens are the same ones the rest of the app uses.
//
// Loaded lazily (React Flow and elk are a sizeable payload), so this module
// must only be imported through React.lazy, see the landscape diagram route.
//
// Visual grammar:
// - Colour: the block's primary architecture domain, loosely following
//   ArchiMate's layer palette (business yellow, application blue, technology
//   green; data, not an ArchiMate layer, in teal). Not ABB versus SBB, which
//   lives in the tooltip so domain and kind do not compete for one channel.
// - Shape: a cylinder for a block in the Data domain, a rounded box for
//   everything else.
// - Containers (hosted_on parents, Azure holding Kubernetes): dashed
//   outline, near-transparent fill, label in the top-left corner so the
//   nested children stay visible.
// - Edges: depends_on thin, data_flow heavier, since "what moves where" is
//   the point of it. hosted_on is never a line.
// Every colour is a CSS token (index.css, --landscape-*), never a literal,
// so both themes stay correct as the grammar grows.
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  getSmoothStepPath,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  type NodeTypes,
  type OnNodeDrag,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ModelIcon } from '@/components/icons/model-icon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import {
  computeLayout,
  type DiagramEdge,
  type DiagramEdgeKind,
  type DiagramNode,
  type LaidOutEdge,
  type LaidOutNode,
  type Point,
} from './landscape-graph';

export type { DiagramEdge, DiagramEdgeKind, DiagramNode } from './landscape-graph';

type DomainCategory = 'business' | 'data' | 'application' | 'technology' | 'unclassified';

// Best-effort classification by domain name, matching the four default
// architecture domains the examples seed. A substring match, so "Data
// Architecture" still matches after someone rewords it; anything else is
// drawn neutral.
function classifyDomain(domainName: string | undefined): DomainCategory {
  const lower = domainName?.toLowerCase() ?? '';
  if (lower.includes('business')) return 'business';
  if (lower.includes('data')) return 'data';
  if (lower.includes('application')) return 'application';
  if (lower.includes('technology')) return 'technology';
  return 'unclassified';
}

const DOMAIN_LABEL: Record<DomainCategory, string> = {
  business: 'Business',
  data: 'Data',
  application: 'Application',
  technology: 'Technology',
  unclassified: 'No domain',
};

const domainFill = (c: DomainCategory) => `var(--landscape-domain-${c}-fill)`;
const domainStroke = (c: DomainCategory) => `var(--landscape-domain-${c}-stroke)`;

const EDGE_STYLE: Record<
  Exclude<DiagramEdgeKind, 'hosted_on'>,
  { stroke: string; width: number }
> = {
  depends_on: { stroke: 'var(--landscape-edge-depends-on)', width: 1.5 },
  data_flow: { stroke: 'var(--landscape-edge-data-flow)', width: 2.5 },
};

const EDGE_LABEL: Record<Exclude<DiagramEdgeKind, 'hosted_on'>, string> = {
  depends_on: 'depends on',
  data_flow: 'data flow',
};

interface BlockData extends Record<string, unknown> {
  label: string;
  kind: DiagramNode['kind'];
  icon?: string;
  domainName?: string;
  category: DomainCategory;
}

type BlockNode = Node<BlockData, 'block'>;
type ContainerNode = Node<BlockData, 'container'>;
type LandscapeNode = BlockNode | ContainerNode;
// `points` is the orthogonal route elk found; dropped once an endpoint is
// dragged, after which the edge is routed from the node handles instead.
type LandscapeEdge = Edge<{ kind: DiagramEdgeKind; points?: Point[] }, 'routed'>;

function kindLabel(kind: DiagramNode['kind']): string {
  return kind === 'architecture' ? 'Architecture building block' : 'Solution building block';
}

// Invisible handles: edges need a side to attach to (left in, right out,
// matching elk's left-to-right layout), but a read-only landscape shows no
// connector dots.
function EdgeHandles() {
  return (
    <>
      <Handle type="target" position={Position.Left} className="landscape-handle" />
      <Handle type="source" position={Position.Right} className="landscape-handle" />
    </>
  );
}

function NodeTooltip({ data, children }: { data: BlockData; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="flex-col items-start gap-0">
        <span className="font-medium">{data.label}</span>
        <span className="opacity-80">
          {kindLabel(data.kind)}
          {data.domainName ? ` · ${data.domainName}` : ''}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

// A leaf block. The Data domain's cylinder is an SVG behind the content;
// every other block is a plain bordered box.
const BlockNodeView = memo(function BlockNodeView({ data, width, height }: NodeProps<BlockNode>) {
  const w = width ?? 0;
  const h = height ?? 0;
  const cylinder = data.category === 'data';
  const ry = Math.min(9, h * 0.18);
  return (
    <NodeTooltip data={data}>
      <div
        className={cn(
          'landscape-node relative flex h-full w-full items-center gap-2.5 px-3 text-xs leading-tight',
          !cylinder && 'rounded-lg border-[1.5px]',
        )}
        style={
          cylinder
            ? undefined
            : { background: domainFill(data.category), borderColor: domainStroke(data.category) }
        }
      >
        {cylinder && (
          <svg
            aria-hidden
            className="landscape-node-shape pointer-events-none absolute inset-0"
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
          >
            <title>{data.label}</title>
            <path
              d={`M 0.75,${ry} L 0.75,${h - ry} A ${w / 2},${ry} 0 0 0 ${w - 0.75},${h - ry} L ${w - 0.75},${ry} A ${w / 2},${ry} 0 0 0 0.75,${ry} Z`}
              fill={domainFill(data.category)}
              stroke={domainStroke(data.category)}
              strokeWidth={1.5}
            />
            <ellipse
              cx={w / 2}
              cy={ry}
              rx={w / 2 - 0.75}
              ry={ry}
              fill={domainFill(data.category)}
              stroke={domainStroke(data.category)}
              strokeWidth={1.5}
            />
          </svg>
        )}
        <ModelIcon id={data.icon} size={20} className="relative z-[1]" />
        <span
          className="relative z-[1] line-clamp-2 min-w-0 flex-1 text-center font-medium"
          style={{ color: 'var(--landscape-label)' }}
        >
          {data.label}
        </span>
        <EdgeHandles />
      </div>
    </NodeTooltip>
  );
});

// A block other blocks run on. React Flow draws the children as their own
// nodes on top; this is the dashed frame and the label row above them.
const ContainerNodeView = memo(function ContainerNodeView({ data }: NodeProps<ContainerNode>) {
  return (
    <div
      className="landscape-node h-full w-full rounded-lg border-[1.5px] border-dashed"
      style={{
        background: 'var(--landscape-container-fill)',
        borderColor: domainStroke(data.category),
      }}
    >
      <NodeTooltip data={data}>
        <div className="flex h-9 w-fit max-w-full items-center gap-1.5 px-2.5 text-[11px] leading-tight font-semibold">
          <ModelIcon id={data.icon} size={14} />
          <span className="truncate" style={{ color: 'var(--landscape-label)' }}>
            {data.label}
          </span>
        </div>
      </NodeTooltip>
      <EdgeHandles />
    </div>
  );
});

const NODE_TYPES: NodeTypes = { block: BlockNodeView, container: ContainerNodeView };

// An orthogonal polyline with its corners rounded off.
function roundedPath(points: Point[], radius = 8): string {
  const [first, ...rest] = points;
  if (!first || rest.length === 0) return '';
  let d = `M ${first.x},${first.y}`;
  let prev = first;
  rest.forEach((corner, i) => {
    const next = rest[i + 1];
    if (!next) {
      d += ` L ${corner.x},${corner.y}`;
      return;
    }
    const inLen = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const outLen = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r > 0) {
      const inX = corner.x - ((corner.x - prev.x) / inLen) * r;
      const inY = corner.y - ((corner.y - prev.y) / inLen) * r;
      const outX = corner.x + ((next.x - corner.x) / outLen) * r;
      const outY = corner.y + ((next.y - corner.y) / outLen) * r;
      d += ` L ${inX},${inY} Q ${corner.x},${corner.y} ${outX},${outY}`;
    } else {
      d += ` L ${corner.x},${corner.y}`;
    }
    prev = corner;
  });
  return d;
}

// Draws elk's route while the nodes sit where elk placed them, and a
// smooth-step path between the handles once they do not.
const RoutedEdgeView = memo(function RoutedEdgeView({
  id,
  data,
  style,
  markerEnd,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<LandscapeEdge>) {
  const path = data?.points
    ? roundedPath(data.points)
    : getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        borderRadius: 8,
      })[0];
  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />;
});

const EDGE_TYPES: EdgeTypes = { routed: RoutedEdgeView };

function toFlowNodes(laidOut: LaidOutNode[], byId: Map<string, DiagramNode>): LandscapeNode[] {
  const nodes: LandscapeNode[] = [];
  for (const n of laidOut) {
    const source = byId.get(n.id);
    if (!source) continue;
    nodes.push({
      id: n.id,
      type: n.isContainer ? 'container' : 'block',
      position: { x: n.x, y: n.y },
      width: n.width,
      height: n.height,
      parentId: n.parentId,
      extent: n.parentId ? 'parent' : undefined,
      data: {
        label: source.label,
        kind: source.kind,
        icon: source.icon,
        domainName: source.domainName,
        category: classifyDomain(source.domainName),
      },
    });
  }
  return nodes;
}

function toFlowEdges(edges: LaidOutEdge[]): LandscapeEdge[] {
  const result: LandscapeEdge[] = [];
  for (const e of edges) {
    if (e.kind === 'hosted_on') continue;
    const style = EDGE_STYLE[e.kind];
    result.push({
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      type: 'routed',
      data: { kind: e.kind, points: e.points },
      style: { stroke: style.stroke, strokeWidth: style.width },
      markerEnd: { type: MarkerType.ArrowClosed, color: style.stroke, width: 16, height: 16 },
    });
  }
  return result;
}

type Hover = { kind: 'node' | 'edge'; id: string } | null;

function Legend() {
  const domains: DomainCategory[] = ['business', 'data', 'application', 'technology'];
  return (
    <Panel
      position="bottom-center"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border/70 bg-background/80 px-3 py-1.5 text-[11px] text-muted-foreground shadow-md backdrop-blur-md"
    >
      {domains.map((d) => (
        <span key={d} className="flex items-center gap-1.5">
          <span
            className="inline-block size-3 rounded-[3px] border"
            style={{ background: domainFill(d), borderColor: domainStroke(d) }}
          />
          {DOMAIN_LABEL[d]}
        </span>
      ))}
      {(Object.keys(EDGE_STYLE) as Array<keyof typeof EDGE_STYLE>).map((kind) => (
        <span key={kind} className="flex items-center gap-1.5">
          <span
            className="inline-block w-5"
            style={{ borderTop: `${EDGE_STYLE[kind].width}px solid ${EDGE_STYLE[kind].stroke}` }}
          />
          {EDGE_LABEL[kind]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-3 rounded-[3px] border border-dashed border-foreground/50" />
        runs on (nested)
      </span>
    </Panel>
  );
}

interface LandscapeFlowProps {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  onNodeClick?: (nodeId: string) => void;
}

function LandscapeFlowInner({ nodes, edges, onNodeClick }: LandscapeFlowProps) {
  const { theme } = useTheme();
  const { fitView } = useReactFlow();
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<LandscapeNode>([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<LandscapeEdge>([]);
  const [hover, setHover] = useState<Hover>(null);
  const [error, setError] = useState<string | null>(null);

  // Lay the graph out whenever the viewpoint changes. The previous diagram
  // stays on screen until the new positions are ready, then the view fits
  // the new extent.
  useEffect(() => {
    let cancelled = false;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    computeLayout(nodes, edges)
      .then((laidOut) => {
        if (cancelled) return;
        setFlowNodes(toFlowNodes(laidOut.nodes, byId));
        setFlowEdges(toFlowEdges(laidOut.edges));
        setError(null);
        window.requestAnimationFrame(() => {
          if (!cancelled) fitView({ padding: 0.08, duration: 300 });
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Layout failed');
      });
    return () => {
      cancelled = true;
    };
  }, [nodes, edges, setFlowNodes, setFlowEdges, fitView]);

  // Hover highlights what touches the element: a node's neighbours over
  // depends_on and data_flow, an edge's two endpoints. Everything else dims,
  // except containers holding something highlighted, which stay readable.
  const { neighbours, parentOf } = useMemo(() => {
    const neighbours = new Map<string, { edgeIds: string[]; nodeIds: string[] }>();
    const add = (self: string, other: string, edgeId: string) => {
      const entry = neighbours.get(self) ?? { edgeIds: [], nodeIds: [] };
      entry.edgeIds.push(edgeId);
      entry.nodeIds.push(other);
      neighbours.set(self, entry);
    };
    for (const e of flowEdges) {
      add(e.source, e.target, e.id);
      add(e.target, e.source, e.id);
    }
    const parentOf = new Map<string, string>();
    for (const n of flowNodes) if (n.parentId) parentOf.set(n.id, n.parentId);
    return { neighbours, parentOf };
  }, [flowNodes, flowEdges]);

  const { decoratedNodes, decoratedEdges } = useMemo(() => {
    if (!hover) return { decoratedNodes: flowNodes, decoratedEdges: flowEdges };
    const edgeById = new Map(flowEdges.map((e) => [e.id, e]));
    const related =
      hover.kind === 'edge'
        ? (() => {
            const e = edgeById.get(hover.id);
            return { edgeIds: [hover.id], nodeIds: e ? [e.source, e.target] : [] };
          })()
        : (neighbours.get(hover.id) ?? { edgeIds: [], nodeIds: [] });
    const lit = new Set([hover.id, ...related.edgeIds, ...related.nodeIds]);
    const preserved = new Set<string>();
    for (const id of [hover.id, ...related.nodeIds]) {
      for (let p = parentOf.get(id); p; p = parentOf.get(p)) preserved.add(p);
    }
    const stateOf = (id: string) =>
      id === hover.id
        ? 'is-active'
        : lit.has(id)
          ? 'is-connected'
          : preserved.has(id)
            ? undefined
            : 'is-dimmed';
    return {
      decoratedNodes: flowNodes.map((n) => ({ ...n, className: stateOf(n.id) })),
      decoratedEdges: flowEdges.map((e) => ({ ...e, className: stateOf(e.id) })),
    };
  }, [hover, flowNodes, flowEdges, neighbours, parentOf]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: LandscapeNode) => onNodeClick?.(node.id),
    [onNodeClick],
  );

  // Dragging a node (and, for a container, everything inside it) leaves
  // elk's routes for its edges pointing at the old place; from then on
  // those edges follow the handles instead.
  const handleDragStart = useCallback<OnNodeDrag<LandscapeNode>>(
    (_, node) => {
      const moved = new Set([node.id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const [child, parent] of parentOf) {
          if (moved.has(parent) && !moved.has(child)) {
            moved.add(child);
            grew = true;
          }
        }
      }
      setFlowEdges((current) =>
        current.map((e) =>
          e.data?.points && (moved.has(e.source) || moved.has(e.target))
            ? { ...e, data: { ...e.data, points: undefined } }
            : e,
        ),
      );
    },
    [parentOf, setFlowEdges],
  );

  if (nodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">No building blocks match this viewpoint.</p>
      </div>
    );
  }

  if (error) {
    return <p className="p-4 text-xs text-destructive">Could not lay out the landscape: {error}</p>;
  }

  return (
    <ReactFlow<LandscapeNode, LandscapeEdge>
      className="landscape-flow"
      colorMode={theme}
      nodes={decoratedNodes}
      edges={decoratedEdges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      onNodeDragStart={handleDragStart}
      onNodeMouseEnter={(_, node) => setHover({ kind: 'node', id: node.id })}
      onNodeMouseLeave={() => setHover(null)}
      onEdgeMouseEnter={(_, edge) => setHover({ kind: 'edge', id: edge.id })}
      onEdgeMouseLeave={() => setHover(null)}
      // Read-only landscape: blocks can be dragged apart to read a tangle,
      // nothing can be connected or deleted, and positions are not kept.
      nodesConnectable={false}
      edgesReconnectable={false}
      deleteKeyCode={null}
      selectionKeyCode={null}
      multiSelectionKeyCode={null}
      elementsSelectable={false}
      zoomOnDoubleClick={false}
      minZoom={0.05}
      maxZoom={2.5}
      fitView
      fitViewOptions={{ padding: 0.08 }}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} />
      <Controls position="bottom-left" showInteractive={false} />
      <MiniMap
        position="bottom-right"
        pannable
        zoomable
        nodeColor={(n) => domainFill((n.data as BlockData).category)}
        nodeStrokeColor={(n) => domainStroke((n.data as BlockData).category)}
        nodeStrokeWidth={2}
      />
      <Legend />
    </ReactFlow>
  );
}

export default function LandscapeFlow(props: LandscapeFlowProps) {
  return (
    <div className="landscape-flow-surface h-full w-full bg-card">
      <TooltipProvider delayDuration={300}>
        <ReactFlowProvider>
          <LandscapeFlowInner {...props} />
        </ReactFlowProvider>
      </TooltipProvider>
    </div>
  );
}
