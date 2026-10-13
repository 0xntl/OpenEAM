// Model icons (D-22). A building block may carry an Iconify id such as
// "simple-icons:postgresql" or "lucide:database"; this module is the web's
// one place that knows how such an id turns into pixels.
//
// UI icons (navigation, buttons) are a different thing: they are known at
// build time and imported from `lucide-react` (D-7). Model icons are data,
// chosen by users at runtime, so they are fetched by id from this API's own
// icon endpoint — never from the public Iconify API; a self-hosted instance
// makes no outbound requests for its diagrams.
import { addAPIProvider, buildIcon, getIcon, loadIcons } from '@iconify/react';

// Mirrors ICON_COLLECTIONS in the API (apps/api/src/icons/icon-id.ts).
export const ICON_COLLECTIONS = ['simple-icons', 'lucide'] as const;
export type IconCollection = (typeof ICON_COLLECTIONS)[number];

// How the picker names the two kinds of icon: a product's own logo, or a
// generic glyph for what the block *is* (a database, a queue, a device).
export const ICON_COLLECTION_LABEL: Record<IconCollection, string> = {
  'simple-icons': 'Products',
  lucide: 'Generic',
};

export function collectionOf(id: string): IconCollection | undefined {
  const prefix = id.split(':')[0];
  return (ICON_COLLECTIONS as readonly string[]).includes(prefix ?? '')
    ? (prefix as IconCollection)
    : undefined;
}

// Filled brand logos read heavier than Lucide's 2px outlines in the same
// box; drawing them at 85% evens the two out.
export function iconScale(id: string): number {
  return collectionOf(id) === 'simple-icons' ? 0.85 : 1;
}

// Lucide has ~1,900 icons and most of them have nothing to do with an
// architecture. The picker offers these before anyone types, so a generic
// block gets a sensible glyph in one click; the search still covers the
// whole set.
export const SUGGESTED_ICONS: string[] = [
  'lucide:server',
  'lucide:database',
  'lucide:hard-drive',
  'lucide:cloud',
  'lucide:container',
  'lucide:cpu',
  'lucide:network',
  'lucide:router',
  'lucide:globe',
  'lucide:app-window',
  'lucide:monitor',
  'lucide:smartphone',
  'lucide:workflow',
  'lucide:layers',
  'lucide:boxes',
  'lucide:package',
  'lucide:plug',
  'lucide:mail',
  'lucide:message-square',
  'lucide:bell',
  'lucide:users',
  'lucide:shield',
  'lucide:key-round',
  'lucide:lock',
  'lucide:file-text',
  'lucide:folder',
  'lucide:table',
  'lucide:chart-column',
  'lucide:calculator',
  'lucide:credit-card',
  'lucide:shopping-cart',
  'lucide:truck',
  'lucide:factory',
  'lucide:building-2',
  'lucide:landmark',
  'lucide:phone',
  'lucide:printer',
  'lucide:calendar',
  'lucide:clock',
  'lucide:code',
  'lucide:terminal',
  'lucide:git-branch',
  'lucide:bot',
  'lucide:zap',
];

// Points @iconify/react's default provider at this API, replacing the
// public Iconify API it would otherwise call. Same origin in dev (Vite
// proxies /api) and in Docker (nginx does), so one line covers both.
export function configureIconProvider(): void {
  addAPIProvider('', { resources: [`${window.location.origin}/api/icons`] });
}

// For consumers that draw synchronously (the landscape renderer builds its
// SVG in diagram-js's drawShape): load these ids first, then read them with
// iconSvg(). Resolves once every id is loaded or known to be missing, and
// after `timeoutMs` regardless, so an unreachable icon endpoint costs a
// diagram its icons, not its rendering. Never rejects.
export function preloadIcons(ids: Array<string | undefined>, timeoutMs = 4000): Promise<void> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      abort();
      finish();
    }, timeoutMs);
    const abort = loadIcons(unique, (_loaded, _missing, pending) => {
      if (pending.length === 0) finish();
    });
  });
}

export interface RawIconSvg {
  // viewBox plus width/height; spread onto an <svg> element.
  attributes: Record<string, string>;
  // The inner markup, using currentColor.
  body: string;
}

// The raw SVG for an icon that has been loaded (see preloadIcons), scaled
// to `size` pixels on its taller side. Undefined when it is not available.
export function iconSvg(id: string, size: number): RawIconSvg | undefined {
  const data = getIcon(id);
  if (!data) return undefined;
  const built = buildIcon(data, { height: size });
  return { attributes: built.attributes as Record<string, string>, body: built.body };
}
