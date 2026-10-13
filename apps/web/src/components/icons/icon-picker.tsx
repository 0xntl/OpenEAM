// Form control for a building block's icon: shows the current choice, and
// on "Change" opens a search over the collections the API serves
// (GET /api/icons/search), with a handful of suggested generic icons
// before anything is typed. Results are grouped the way an architect
// thinks about them — a product's own logo, or a generic glyph.
import { Search, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  collectionOf,
  ICON_COLLECTION_LABEL,
  ICON_COLLECTIONS,
  type IconCollection,
  SUGGESTED_ICONS,
} from '@/lib/icons';
import { ModelIcon } from './model-icon';

interface SearchHit {
  id: string;
  collection: IconCollection;
  name: string;
}

const SEARCH_LIMIT = 60;
const DEBOUNCE_MS = 200;

async function searchIcons(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  const url = `/api/icons/search?q=${encodeURIComponent(query)}&limit=${SEARCH_LIMIT}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Icon search failed (${res.status})`);
  const body = (await res.json()) as { hits: SearchHit[] };
  return body.hits;
}

function IconGrid({
  ids,
  selected,
  onPick,
}: {
  ids: string[];
  selected: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-1">
      {ids.map((id) => {
        const name = id.slice(id.indexOf(':') + 1);
        return (
          <button
            key={id}
            type="button"
            title={id}
            onClick={() => onPick(id)}
            aria-pressed={selected === id}
            className="flex flex-col items-center gap-1 rounded-md border border-transparent p-1.5 text-foreground hover:bg-muted aria-pressed:border-ring aria-pressed:bg-muted"
          >
            <ModelIcon id={id} size={20} />
            <span className="w-full truncate text-center text-[10px] text-muted-foreground">
              {name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced search; a stale response for an earlier query is dropped.
  useEffect(() => {
    const q = query.trim();
    if (!open || q === '') {
      setHits([]);
      setSearching(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      searchIcons(q, controller.signal)
        .then((result) => {
          setHits(result);
          setError(null);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : 'Icon search failed');
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  const byCollection = new Map<IconCollection, string[]>();
  for (const hit of hits) {
    const list = byCollection.get(hit.collection) ?? [];
    list.push(hit.id);
    byCollection.set(hit.collection, list);
  }
  const showSuggestions = query.trim() === '';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
        <ModelIcon id={value} size={20} />
        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
          {value ?? <span className="text-muted-foreground">No icon</span>}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'Change'}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove icon"
            onClick={() => onChange(null)}
          >
            <X />
          </Button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-2">
          <label htmlFor={inputId} className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={inputId}
              className="pl-7"
              placeholder="Search products and generic icons, e.g. postgres, queue"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </label>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {showSuggestions ? (
            <>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Suggested
              </p>
              <IconGrid ids={SUGGESTED_ICONS} selected={value} onPick={pick} />
            </>
          ) : hits.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {searching ? 'Searching…' : 'No icon matches.'}
            </p>
          ) : (
            ICON_COLLECTIONS.map((collection) => {
              const ids = byCollection.get(collection);
              if (!ids || ids.length === 0) return null;
              return (
                <div key={collection} className="flex flex-col gap-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {ICON_COLLECTION_LABEL[collection]}
                  </p>
                  <IconGrid ids={ids} selected={value} onPick={pick} />
                </div>
              );
            })
          )}
          {!showSuggestions && hits.length >= SEARCH_LIMIT && (
            <p className="text-[10px] text-muted-foreground">
              Showing the first {SEARCH_LIMIT} matches; refine the search for more.
            </p>
          )}
        </div>
      )}
      {value && collectionOf(value) === undefined && (
        <p className="text-xs text-destructive">
          This icon's collection is not served by this instance.
        </p>
      )}
    </div>
  );
}
