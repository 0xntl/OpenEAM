// ⌘K / Ctrl+K: jump to any page or any object of the current enterprise by
// typing a few letters. Loads the names of everything once per opening;
// at the sizes this app is built for that is one small query.
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowLeftRight,
  Blocks,
  Home,
  Library,
  type LucideIcon,
  Map as MapIcon,
  Route as RouteIcon,
  Search,
  ShieldCheck,
  Table2,
  Target,
  Users,
  Workflow,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useEnterprise } from '@/lib/enterprise';

const PALETTE_QUERY = gql`
  query CommandPalette($enterpriseId: String!) {
    businessCapabilities(enterpriseId: $enterpriseId) {
      id
      name
    }
    businessProcesses(enterpriseId: $enterpriseId) {
      id
      name
    }
    valueStreams(enterpriseId: $enterpriseId) {
      id
      name
    }
    actors(enterpriseId: $enterpriseId) {
      id
      name
    }
    informationObjects(enterpriseId: $enterpriseId) {
      id
      name
    }
    buildingBlocks(enterpriseId: $enterpriseId) {
      id
      name
    }
  }
`;

interface Named {
  id: string;
  name: string;
}
interface PaletteData {
  businessCapabilities: Named[];
  businessProcesses: Named[];
  valueStreams: Named[];
  actors: Named[];
  informationObjects: Named[];
  buildingBlocks: Named[];
}

interface Entry {
  key: string;
  label: string;
  group: string;
  icon: LucideIcon;
  to: string;
}

const PAGES: Entry[] = [
  { key: 'p-overview', label: 'Overview', group: 'Pages', icon: Home, to: '/' },
  { key: 'p-vs', label: 'Value Streams', group: 'Pages', icon: RouteIcon, to: '/value-streams' },
  {
    key: 'p-cap',
    label: 'Business Capabilities',
    group: 'Pages',
    icon: Target,
    to: '/capabilities',
  },
  {
    key: 'p-proc',
    label: 'Business Processes',
    group: 'Pages',
    icon: Workflow,
    to: '/business-processes',
  },
  { key: 'p-act', label: 'Actors', group: 'Pages', icon: Users, to: '/actors' },
  {
    key: 'p-info',
    label: 'Information',
    group: 'Pages',
    icon: Library,
    to: '/information-objects',
  },
  { key: 'p-bb', label: 'Building Blocks', group: 'Pages', icon: Blocks, to: '/building-blocks' },
  { key: 'p-land', label: 'Landscape', group: 'Pages', icon: MapIcon, to: '/landscape/diagram' },
  { key: 'p-table', label: 'Landscape Table', group: 'Pages', icon: Table2, to: '/landscape' },
  {
    key: 'p-dx',
    label: 'Export & Import',
    group: 'Pages',
    icon: ArrowLeftRight,
    to: '/data-exchange',
  },
];
const ADMIN_PAGE: Entry = {
  key: 'p-admin',
  label: 'Administration',
  group: 'Pages',
  icon: ShieldCheck,
  to: '/admin',
};

function entriesOf(data: PaletteData | undefined): Entry[] {
  if (!data) return [];
  const make = (rows: Named[], group: string, icon: LucideIcon, path: string) =>
    rows.map((r) => ({
      key: `${group}-${r.id}`,
      label: r.name,
      group,
      icon,
      to: `${path}/${r.id}`,
    }));
  return [
    ...make(data.businessCapabilities, 'Business Capabilities', Target, '/capabilities'),
    ...make(data.businessProcesses, 'Business Processes', Workflow, '/business-processes'),
    ...make(data.valueStreams, 'Value Streams', RouteIcon, '/value-streams'),
    ...make(data.actors, 'Actors', Users, '/actors'),
    ...make(data.informationObjects, 'Information', Library, '/information-objects'),
    ...make(data.buildingBlocks, 'Building Blocks', Blocks, '/building-blocks'),
  ];
}

// Subsequence match ("cusonb" finds "Customer Onboarding"), ranked by how
// early and how tightly the letters sit.
function score(label: string, query: string): number {
  const l = label.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 1;
  if (l.startsWith(q)) return 100;
  const idx = l.indexOf(q);
  if (idx >= 0) return 80 - Math.min(idx, 30);
  let li = 0;
  let gaps = 0;
  for (const ch of q) {
    const found = l.indexOf(ch, li);
    if (found < 0) return 0;
    gaps += found - li;
    li = found + 1;
  }
  return Math.max(1, 40 - gaps);
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const { enterprise } = useEnterprise();
  const { isAdmin } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery<PaletteData>(PALETTE_QUERY, {
    variables: { enterpriseId: enterprise?.id },
    skip: !open || !enterprise,
    fetchPolicy: 'cache-and-network',
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('openeam:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('openeam:palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const all = [...PAGES, ...(isAdmin ? [ADMIN_PAGE] : []), ...entriesOf(data)];
    const q = query.trim();
    const scored = all
      .map((e) => ({ e, s: score(e.label, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.e.label.localeCompare(b.e.label));
    return scored.slice(0, q ? 40 : 11).map((x) => x.e);
  }, [data, query, isAdmin]);

  const go = (entry: Entry) => {
    setOpen(false);
    void navigate({ to: entry.to });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = results[active];
      if (entry) go(entry);
    }
  };

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let lastGroup = '';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="fixed top-[15vh] left-1/2 z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-background shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        >
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Jump to a page or an object of the current enterprise.
          </DialogPrimitive.Description>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={enterprise ? `Search ${enterprise.name}…` : 'Search pages…'}
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Search"
            />
            <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">
              esc
            </kbd>
          </div>
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
            {results.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing matches “{query}”.
              </p>
            )}
            {results.map((entry, i) => {
              const heading = entry.group !== lastGroup ? entry.group : null;
              lastGroup = entry.group;
              return (
                <div key={entry.key}>
                  {heading && (
                    <p className="px-4 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {heading}
                    </p>
                  )}
                  <button
                    type="button"
                    data-index={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(entry)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                      i === active ? 'bg-muted text-foreground' : 'text-foreground'
                    }`}
                  >
                    <entry.icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                    <span className="truncate">{entry.label}</span>
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
            <span>
              <kbd className="rounded border border-border px-1 font-mono">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="rounded border border-border px-1 font-mono">↵</kbd> open
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// Sidebar entry that opens the palette and advertises the shortcut.
export function CommandPaletteTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
      aria-label="Search (Ctrl+K)"
    >
      <Search className="size-4 shrink-0" />
      <span className="flex-1 text-left group-data-[collapsible=icon]:hidden">Search</span>
      <kbd className="rounded border border-border px-1 font-mono text-[10px] group-data-[collapsible=icon]:hidden">
        ⌘K
      </kbd>
    </button>
  );
}
