// Serves the icon collections a building block's `icon` may point at, in
// Iconify's JSON format, from this process — a self-hosted instance never
// calls the public Iconify API (D-22). The sets are loaded once at startup
// and kept in memory (a few megabytes); the web asks for the handful of
// icons it is about to draw, never for a whole set.

import type { IconifyInfo, IconifyJSON } from '@iconify/types';
import { getIcons } from '@iconify/utils';
import { Injectable } from '@nestjs/common';
import { ICON_COLLECTIONS, type IconCollection, parseIconId } from './icon-id';

export interface IconCollectionSummary {
  prefix: IconCollection;
  name: string;
  total: number;
  license: { title: string; spdx?: string; url?: string };
}

export interface IconSearchHit {
  id: string;
  collection: IconCollection;
  name: string;
}

interface IndexEntry extends IconSearchHit {
  // Name plus every alias, space-separated, for substring matching.
  terms: string;
}

// `require`, not `import`: the sets are JSON literals of a megabyte or two,
// and TypeScript would otherwise infer a type for every key in them on each
// typecheck. The package names are fixed, so the dynamic path is safe.
function loadSet(collection: IconCollection): { icons: IconifyJSON; info: IconifyInfo } {
  return {
    icons: require(`@iconify-json/${collection}/icons.json`) as IconifyJSON,
    info: require(`@iconify-json/${collection}/info.json`) as IconifyInfo,
  };
}

export const SEARCH_LIMIT_DEFAULT = 60;
export const SEARCH_LIMIT_MAX = 200;

@Injectable()
export class IconsService {
  private readonly sets = new Map<IconCollection, IconifyJSON>();
  private readonly summaries: IconCollectionSummary[] = [];
  private readonly index: IndexEntry[] = [];

  constructor() {
    for (const collection of ICON_COLLECTIONS) {
      const { icons, info } = loadSet(collection);
      this.sets.set(collection, icons);
      this.summaries.push({
        prefix: collection,
        name: info.name,
        total: info.total ?? Object.keys(icons.icons).length,
        license: info.license,
      });
      this.index.push(...buildIndex(collection, icons));
    }
  }

  collections(): IconCollectionSummary[] {
    return this.summaries;
  }

  // The subset the Iconify API would return for `GET /{prefix}.json?icons=…`:
  // the named icons (aliases resolved to their parents), the set's defaults,
  // and `not_found` for names the set does not have. Undefined when the
  // collection itself is not served.
  subset(prefix: string, names: string[]): IconifyJSON | undefined {
    const set = this.sets.get(prefix as IconCollection);
    if (!set) return undefined;
    return getIcons(set, names, true) ?? { prefix: set.prefix, icons: {}, not_found: names };
  }

  // Whether an id names an icon this instance can actually draw. Stricter
  // than isIconId(): the name has to exist in the set, aliases included.
  exists(id: string): boolean {
    const parsed = parseIconId(id);
    if (!parsed) return false;
    const set = this.sets.get(parsed.collection);
    return Boolean(set?.icons[parsed.name] || set?.aliases?.[parsed.name]);
  }

  // Substring search over names and aliases, every term required. Exact
  // and prefix matches on the name come first, then the rest in the
  // collection order of ICON_COLLECTIONS and alphabetically. An in-memory
  // scan over ~6,000 entries is well under a millisecond.
  search(query: string, limit = SEARCH_LIMIT_DEFAULT): IconSearchHit[] {
    const terms = query
      .toLowerCase()
      .split(/[\s:]+/)
      .map((t) => t.replace(/[^a-z0-9-]/g, ''))
      .filter(Boolean);
    if (terms.length === 0) return [];
    const needle = terms.join('-');

    const ranked: Array<{ rank: number; hit: IconSearchHit }> = [];
    for (const entry of this.index) {
      if (!terms.every((t) => entry.terms.includes(t))) continue;
      const rank =
        entry.name === needle
          ? 0
          : entry.name.startsWith(needle)
            ? 1
            : entry.name.includes(needle)
              ? 2
              : 3;
      ranked.push({ rank, hit: { id: entry.id, collection: entry.collection, name: entry.name } });
    }
    ranked.sort((a, b) => a.rank - b.rank);
    return ranked.slice(0, Math.min(Math.max(limit, 1), SEARCH_LIMIT_MAX)).map((r) => r.hit);
  }
}

function buildIndex(collection: IconCollection, set: IconifyJSON): IndexEntry[] {
  const aliasesByParent = new Map<string, string[]>();
  for (const [alias, data] of Object.entries(set.aliases ?? {})) {
    const list = aliasesByParent.get(data.parent) ?? [];
    list.push(alias);
    aliasesByParent.set(data.parent, list);
  }
  return Object.entries(set.icons)
    .filter(([, data]) => !data.hidden)
    .map(([name]) => ({
      id: `${collection}:${name}`,
      collection,
      name,
      terms: [name, ...(aliasesByParent.get(name) ?? [])].join(' '),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
