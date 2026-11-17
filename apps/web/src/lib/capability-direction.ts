import type { CapabilityDirection } from './entities';

// Strategic-architecture direction for a business capability: where
// investment goes, where it deliberately doesn't. Order carries meaning —
// invest -> sunset reads left-to-right as "more commitment" to "less".
export const CAPABILITY_DIRECTIONS: CapabilityDirection[] = [
  'INVEST',
  'SUSTAIN',
  'COMMODITY',
  'SUNSET',
];

export const CAPABILITY_DIRECTION_LABEL: Record<CapabilityDirection, string> = {
  INVEST: 'Invest',
  SUSTAIN: 'Sustain',
  COMMODITY: 'Commodity / outsource',
  SUNSET: 'Sunset',
};

// Plain Tailwind tokens rather than the landscape diagram's CSS-variable
// palette (index.css --landscape-*) — that system exists for the diagram's
// SVG renderer, not for badges in ordinary DOM.
// The same colours as a fill, for a capability drawn as a tile (the value
// stream diagram's Direction lens). Light enough that the tile's text stays
// the foreground colour.
export const CAPABILITY_DIRECTION_FILL: Record<CapabilityDirection, string> = {
  INVEST: 'border-emerald-600/40 bg-emerald-500/10',
  SUSTAIN: 'border-border bg-muted',
  COMMODITY: 'border-amber-600/40 bg-amber-500/10',
  SUNSET: 'border-rose-600/40 bg-rose-500/10',
};

export const CAPABILITY_DIRECTION_STYLE: Record<CapabilityDirection, string> = {
  INVEST: 'border-emerald-600/40 text-emerald-700 dark:text-emerald-400',
  SUSTAIN: 'border-border text-muted-foreground',
  COMMODITY: 'border-amber-600/40 text-amber-700 dark:text-amber-400',
  SUNSET: 'border-rose-600/40 text-rose-700 dark:text-rose-400',
};
