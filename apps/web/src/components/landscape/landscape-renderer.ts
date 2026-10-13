// Minimal diagram-js renderer for building blocks and the edges between
// them.
//
// Visual grammar:
// - Shape: cylinder = a block whose primary domain is Data, rectangle =
//   everything else.
// - Color: architecture domain (business/data/application/technology),
//   loosely following ArchiMate's own layer palette — not ABB vs SBB, which
//   moves to the hover tooltip instead so domain and kind don't compete for
//   the same visual channel. A block's domain is many-to-many in the data
//   model; this renders only the first/primary one.
// - Containers (hosted_on parents, e.g. Azure holding Kubernetes): dashed
//   outline, near-transparent fill, label pinned to the top-left so nested
//   children stay visible through it, rather than the centered-label solid
//   fill leaf blocks get.
//
// Business capabilities intentionally don't render here: "what fulfills
// this capability?" is a drill-down question starting from one capability,
// not something that belongs layered onto the whole-landscape view.
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { ConnectionLike, ShapeLike } from 'diagram-js/lib/core/Types';
import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';
import { append as svgAppend, attr as svgAttr, create as svgCreate } from 'tiny-svg';
import { iconScale, iconSvg, type RawIconSvg } from '@/lib/icons';
import type { DiagramEdge, DiagramNode } from './landscape-layout';

const ARROW_MARKER_ID = 'landscape-diagram-arrow';

type DomainCategory = 'business' | 'data' | 'application' | 'technology';

// Colors live as CSS custom properties (index.css, --landscape-*) rather
// than literals here, with separate light/dark values defined there — the
// renderer just points at a token and the SVG repaints on its own when the
// theme toggles, no re-render needed. Loosely follows ArchiMate's layer
// colors (business=yellow, application=blue, technology=green); data isn't
// a distinct ArchiMate layer, so this picks a teal that reads as its own
// thing without clashing.
//
// Never hardcode a color in this file — add a token to index.css instead,
// so dark mode stays correct as this renderer's visual language grows.
const DOMAIN_COLORS: Record<DomainCategory, { stroke: string; fill: string }> = {
  business: {
    stroke: 'var(--landscape-domain-business-stroke)',
    fill: 'var(--landscape-domain-business-fill)',
  },
  data: {
    stroke: 'var(--landscape-domain-data-stroke)',
    fill: 'var(--landscape-domain-data-fill)',
  },
  application: {
    stroke: 'var(--landscape-domain-application-stroke)',
    fill: 'var(--landscape-domain-application-fill)',
  },
  technology: {
    stroke: 'var(--landscape-domain-technology-stroke)',
    fill: 'var(--landscape-domain-technology-fill)',
  },
};

// Custom/renamed architecture domains (this app doesn't enforce the 4
// default names as a fixed enum) fall back to neutral grey.
const UNCLASSIFIED_COLOR = {
  stroke: 'var(--landscape-domain-unclassified-stroke)',
  fill: 'var(--landscape-domain-unclassified-fill)',
};

// Best-effort classification by domain name, matching the 4 default
// architecture domains this app seeds (see examples/*.json) — a substring
// match rather than an exact one so "Data Architecture" still matches if a
// user tweaks the wording.
function classifyDomain(domainName: string | undefined): DomainCategory | undefined {
  if (!domainName) return undefined;
  const lower = domainName.toLowerCase();
  if (lower.includes('business')) return 'business';
  if (lower.includes('data')) return 'data';
  if (lower.includes('application')) return 'application';
  if (lower.includes('technology')) return 'technology';
  return undefined;
}

// hosted_on never reaches drawConnection — it becomes nesting, not a line
// (see landscape-layout.ts's buildContainmentTree) — but the map stays
// exhaustive so a future edge kind can't silently render with no color.
// data_flow is drawn heavier than depends_on since "what moves where" is
// the point of it.
const EDGE_STYLES: Record<DiagramEdge['kind'], { stroke: string; dashed: boolean; width: number }> =
  {
    depends_on: { stroke: 'var(--landscape-edge-depends-on)', dashed: false, width: 1.5 },
    data_flow: { stroke: 'var(--landscape-edge-data-flow)', dashed: false, width: 2.5 },
    hosted_on: { stroke: 'transparent', dashed: false, width: 0 },
  };

function truncate(label: string, max = 22): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

// Model icon sizes inside a node: a leaf block shows it at 20px to the left
// of its centred label, a container at 14px before its top-left label.
const LEAF_ICON_SIZE = 20;
const LEAF_ICON_X = 12;
const CONTAINER_ICON_SIZE = 14;
const CONTAINER_ICON_X = 10;

// The icon is inlined as a nested <svg> so the diagram stays one
// self-contained SVG (no <use> into a sprite, nothing to fetch when it is
// exported). Its paths use currentColor, so the label color applies.
function drawIcon(parentGfx: SVGElement, icon: RawIconSvg, x: number, y: number, size: number) {
  const el = svgCreate('svg', { ...icon.attributes, x, y, width: size, height: size });
  el.innerHTML = icon.body;
  el.style.color = 'var(--landscape-label)';
  svgAppend(parentGfx, el);
}

// Looks the icon up in the cache preloadIcons() filled (landscape-layout.ts)
// and scales a filled brand logo down a little, as the React side does.
function resolveIcon(
  id: string | undefined,
  size: number,
): { svg: RawIconSvg; size: number } | undefined {
  if (!id) return undefined;
  const scaled = Math.round(size * iconScale(id));
  const svg = iconSvg(id, scaled);
  return svg ? { svg, size: scaled } : undefined;
}

type RenderableNode = DiagramNode & { isContainer?: boolean };

// diagram-js doesn't inject an arrowhead marker definition for us — add one
// to the canvas's root <svg> once, on first render.
export function ensureArrowMarker(container: HTMLElement): void {
  const svg = container.querySelector('svg');
  if (!svg || svg.querySelector(`#${ARROW_MARKER_ID}`)) return;

  const defs = svgCreate('defs');
  const marker = svgCreate('marker', {
    id: ARROW_MARKER_ID,
    viewBox: '0 0 10 10',
    refX: 9,
    refY: 5,
    markerWidth: 7,
    markerHeight: 7,
    orient: 'auto-start-reverse',
  });
  const path = svgCreate('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--landscape-arrow)' });
  svgAppend(marker, path);
  svgAppend(defs, marker);
  svg.insertBefore(defs, svg.firstChild);
}

function drawRoundedRect(
  parentGfx: SVGElement,
  width: number,
  height: number,
  colors: { stroke: string; fill: string },
  isContainer: boolean,
): SVGElement {
  const rect = svgCreate('rect', {
    width,
    height,
    rx: 6,
    ry: 6,
    stroke: colors.stroke,
    strokeWidth: 1.5,
    fill: isContainer ? 'var(--landscape-container-fill)' : colors.fill,
  });
  if (isContainer) {
    svgAttr(rect, { 'stroke-dasharray': '5,3' });
  }
  svgAppend(parentGfx, rect);
  return rect;
}

// Classic two-arc "database" icon: a body path with rounded top/bottom
// edges, plus a top ellipse drawn over it to read as the cylinder's lid.
function drawCylinder(
  parentGfx: SVGElement,
  width: number,
  height: number,
  colors: { stroke: string; fill: string },
): SVGElement {
  const rx = width / 2;
  const ry = Math.min(10, height * 0.2);
  const body = svgCreate('path', {
    d: `M 0,${ry} L 0,${height - ry} A ${rx},${ry} 0 0 0 ${width},${height - ry} L ${width},${ry} A ${rx},${ry} 0 0 0 0,${ry} Z`,
    stroke: colors.stroke,
    strokeWidth: 1.5,
    fill: colors.fill,
  });
  svgAppend(parentGfx, body);
  const lid = svgCreate('ellipse', {
    cx: rx,
    cy: ry,
    rx,
    ry,
    stroke: colors.stroke,
    strokeWidth: 1.5,
    fill: colors.fill,
  });
  svgAppend(parentGfx, lid);
  return body;
}

class LandscapeRenderer extends BaseRenderer {
  static $inject = ['eventBus'];

  constructor(eventBus: EventBus) {
    super(eventBus, 2000);
  }

  override canRender(): boolean {
    return true;
  }

  override drawShape(parentGfx: SVGElement, shape: ShapeLike): SVGElement {
    const node = (shape as unknown as { businessObject: RenderableNode }).businessObject;
    const width = shape.width ?? 0;
    const height = shape.height ?? 0;

    const category = classifyDomain(node.domainName);
    const colors = category ? DOMAIN_COLORS[category] : UNCLASSIFIED_COLOR;

    const mainEl =
      category === 'data'
        ? drawCylinder(parentGfx, width, height, colors)
        : drawRoundedRect(parentGfx, width, height, colors, Boolean(node.isContainer));

    const icon = resolveIcon(node.icon, node.isContainer ? CONTAINER_ICON_SIZE : LEAF_ICON_SIZE);
    if (icon) {
      if (node.isContainer) {
        drawIcon(parentGfx, icon.svg, CONTAINER_ICON_X, 16 - CONTAINER_ICON_SIZE + 2, icon.size);
      } else {
        drawIcon(parentGfx, icon.svg, LEAF_ICON_X, (height - icon.size) / 2, icon.size);
      }
    }

    // With an icon, the label gives up the icon's strip on the left and
    // centres in what remains, so icon and text read as one unit.
    const labelInset = icon ? LEAF_ICON_X + LEAF_ICON_SIZE + 4 : 0;
    const text = svgCreate('text');
    svgAttr(
      text,
      node.isContainer
        ? {
            x: icon ? CONTAINER_ICON_X + CONTAINER_ICON_SIZE + 6 : 10,
            y: 16,
            'text-anchor': 'start',
            'font-size': 11,
            'font-weight': 600,
          }
        : {
            x: labelInset + (width - labelInset - 8) / 2,
            y: height / 2,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            'font-size': 12,
          },
    );
    svgAttr(text, { fill: 'var(--landscape-label)' });
    text.textContent = truncate(node.label, icon && !node.isContainer ? 18 : 22);
    const title = svgCreate('title');
    title.textContent = `${node.label} (${node.kind === 'architecture' ? 'Architecture' : 'Solution'} Building Block)`;
    svgAppend(text, title);
    svgAppend(parentGfx, text);

    return mainEl;
  }

  override drawConnection(parentGfx: SVGElement, connection: ConnectionLike): SVGElement {
    const edge = (connection as unknown as { businessObject: DiagramEdge }).businessObject;
    const style = EDGE_STYLES[edge.kind];
    const points = (connection.waypoints ?? []).map((p) => `${p.x},${p.y}`).join(' ');

    const line = svgCreate('polyline', {
      points,
      fill: 'none',
      stroke: style.stroke,
      strokeWidth: style.width,
      'marker-end': `url(#${ARROW_MARKER_ID})`,
    });
    if (style.dashed) {
      svgAttr(line, { 'stroke-dasharray': '4,3' });
    }
    svgAppend(parentGfx, line);

    return line;
  }
}

export default {
  __init__: ['landscapeRenderer'],
  landscapeRenderer: ['type', LandscapeRenderer],
};
