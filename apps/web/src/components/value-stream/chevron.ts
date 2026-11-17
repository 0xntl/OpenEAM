// The chevron row is the established notation for a value stream's stages.
// Stages share one grid of equal columns, so whatever sits below a stage
// (capability tiles, a list row's strip) lines up with it. Each chevron is
// clipped inside its own column, a gap apart, rather than overlapping its
// neighbour: overlap would break the column edges everything else aligns to.

export function stageColumns(count: number): string {
  return `repeat(${count}, minmax(0, 1fr))`;
}

// A point on the right of every stage, a notch on the left of every stage
// but the first. A lone stage stays a plain box.
export function chevronClipPath(index: number, count: number, arrow: number): string | undefined {
  if (count < 2) return undefined;
  const point = `calc(100% - ${arrow}px) 0, 100% 50%, calc(100% - ${arrow}px) 100%`;
  return index === 0
    ? `polygon(0 0, ${point}, 0 100%)`
    : `polygon(0 0, ${point}, 0 100%, ${arrow}px 50%)`;
}
