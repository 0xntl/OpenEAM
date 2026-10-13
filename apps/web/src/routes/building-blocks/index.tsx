import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BuildingBlockFormSheet } from '@/components/building-blocks/building-block-form-sheet';
import { ModelIcon } from '@/components/icons/model-icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { contentWidthClassName, PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TableSkeleton } from '@/components/ui/skeletons';
import { useConfirm } from '@/lib/confirm';
import { useEnterprise, WriteOnly } from '@/lib/enterprise';
import type {
  ArchitectureDomain,
  BuildingBlock,
  BuildingBlockKind,
  LifecyclePhase,
  OrganizationUnit,
} from '@/lib/entities';
import {
  ARCHITECTURE_LEVEL_LABEL,
  BUILDING_BLOCK_KIND_LABEL,
  formatValidity,
  kindOf,
  LIFECYCLE_LABEL,
  LIFECYCLE_PHASES,
} from '@/lib/labels';
import { toast } from '@/lib/toast';
import { SELECT_EMPTY_VALUE } from '@/lib/utils';

const BUILDING_BLOCKS_QUERY = gql`
  query BuildingBlocksIndex($enterpriseId: String!) {
    buildingBlocks(enterpriseId: $enterpriseId) {
      id
      name
      description
      icon
      lifecyclePhase
      validFrom
      validTo
      architectureDomainIds
      organizationUnitLinks {
        organizationUnitId
      }
      __typename
      ... on ArchitectureBuildingBlock {
        architectureLevel
      }
    }
    architectureDomains(enterpriseId: $enterpriseId) {
      id
      name
      isDefault
    }
    organizationUnits(enterpriseId: $enterpriseId) {
      id
      name
      parentId
    }
  }
`;

const DELETE_BUILDING_BLOCK = gql`
  mutation DeleteBuildingBlock($id: String!) {
    deleteBuildingBlock(id: $id)
  }
`;

interface BuildingBlocksData {
  buildingBlocks: BuildingBlock[];
  architectureDomains: ArchitectureDomain[];
  organizationUnits: OrganizationUnit[];
}

function BuildingBlocksIndexRoute() {
  const { enterprise } = useEnterprise();
  const { data, loading, error, refetch } = useQuery<BuildingBlocksData>(BUILDING_BLOCKS_QUERY, {
    variables: { enterpriseId: enterprise?.id },
    skip: !enterprise,
  });
  const [deleteBuildingBlock] = useMutation(DELETE_BUILDING_BLOCK);
  const confirm = useConfirm();

  const [editing, setEditing] = useState<BuildingBlock | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<BuildingBlockKind | ''>('');
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecyclePhase | ''>('');
  const [domainFilter, setDomainFilter] = useState('');
  const [organizationUnitFilter, setOrganizationUnitFilter] = useState('');

  const domains = data?.architectureDomains ?? [];
  const organizationUnits = data?.organizationUnits ?? [];
  const domainNameById = new Map(domains.map((d) => [d.id, d.name]));
  const organizationUnitNameById = new Map(organizationUnits.map((u) => [u.id, u.name]));

  const hasActiveFilters = Boolean(
    search || kindFilter || lifecycleFilter || domainFilter || organizationUnitFilter,
  );

  const clearFilters = () => {
    setSearch('');
    setKindFilter('');
    setLifecycleFilter('');
    setDomainFilter('');
    setOrganizationUnitFilter('');
  };

  const filteredBlocks = useMemo(() => {
    const blocks = data?.buildingBlocks ?? [];
    const q = search.trim().toLowerCase();
    return blocks.filter((block) => {
      if (q) {
        const haystack = `${block.name} ${block.description ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (kindFilter) {
        if (kindOf(block.__typename) !== kindFilter) return false;
      }
      if (lifecycleFilter && block.lifecyclePhase !== lifecycleFilter) return false;
      if (domainFilter && !block.architectureDomainIds.includes(domainFilter)) return false;
      if (
        organizationUnitFilter &&
        !block.organizationUnitLinks.some((l) => l.organizationUnitId === organizationUnitFilter)
      )
        return false;
      return true;
    });
  }, [
    data?.buildingBlocks,
    search,
    kindFilter,
    lifecycleFilter,
    domainFilter,
    organizationUnitFilter,
  ]);

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (block: BuildingBlock) => {
    setEditing(block);
    setSheetOpen(true);
  };

  const handleDelete = async (block: BuildingBlock) => {
    if (!(await confirm({ title: `Delete "${block.name}"?`, destructive: true }))) return;
    await deleteBuildingBlock({ variables: { id: block.id } });
    toast.success(`"${block.name}" deleted.`);
    await refetch();
  };

  return (
    <div className={contentWidthClassName}>
      <PageHeader
        title="Building Blocks"
        action={
          <WriteOnly>
            <Button onClick={openCreate} disabled={!enterprise}>
              New building block
            </Button>
          </WriteOnly>
        }
      />

      {loading && !data && <TableSkeleton />}
      {error && <p className="text-sm text-destructive">Failed to load building blocks.</p>}

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <label
          htmlFor="bb-search"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          Search
          <Input
            id="bb-search"
            className="w-48"
            placeholder="Name or description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label
          htmlFor="bb-kind-filter"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          Kind
          <Select
            value={kindFilter || SELECT_EMPTY_VALUE}
            onValueChange={(v) =>
              setKindFilter(v === SELECT_EMPTY_VALUE ? '' : (v as BuildingBlockKind))
            }
          >
            <SelectTrigger id="bb-kind-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY_VALUE}>All</SelectItem>
              <SelectItem value="ARCHITECTURE">ABB</SelectItem>
              <SelectItem value="SOLUTION">SBB</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label
          htmlFor="bb-lifecycle-filter"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          Lifecycle
          <Select
            value={lifecycleFilter || SELECT_EMPTY_VALUE}
            onValueChange={(v) =>
              setLifecycleFilter(v === SELECT_EMPTY_VALUE ? '' : (v as LifecyclePhase))
            }
          >
            <SelectTrigger id="bb-lifecycle-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY_VALUE}>All</SelectItem>
              {LIFECYCLE_PHASES.map((phase) => (
                <SelectItem key={phase} value={phase}>
                  {LIFECYCLE_LABEL[phase]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label
          htmlFor="bb-domain-filter"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          Domain
          <Select
            value={domainFilter || SELECT_EMPTY_VALUE}
            onValueChange={(v) => setDomainFilter(v === SELECT_EMPTY_VALUE ? '' : v)}
          >
            <SelectTrigger id="bb-domain-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY_VALUE}>All</SelectItem>
              {domains.map((domain) => (
                <SelectItem key={domain.id} value={domain.id}>
                  {domain.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label
          htmlFor="bb-org-unit-filter"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          Organization unit
          <Select
            value={organizationUnitFilter || SELECT_EMPTY_VALUE}
            onValueChange={(v) => setOrganizationUnitFilter(v === SELECT_EMPTY_VALUE ? '' : v)}
          >
            <SelectTrigger id="bb-org-unit-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY_VALUE}>All</SelectItem>
              {organizationUnits.map((unit) => (
                <SelectItem key={unit.id} value={unit.id}>
                  {unit.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Kind</th>
              <th className="px-4 py-2">Level</th>
              <th className="px-4 py-2">Lifecycle</th>
              <th className="px-4 py-2">Domain</th>
              <th className="px-4 py-2">Organization unit</th>
              <th className="px-4 py-2">Valid</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {filteredBlocks.map((block) => (
              <tr
                key={block.id}
                className="group border-b border-border last:border-0 hover:bg-muted/40"
              >
                <td className="px-4 py-2 font-medium">
                  <Link
                    to="/building-blocks/$buildingBlockId"
                    params={{ buildingBlockId: block.id }}
                    className="inline-flex items-center gap-2 text-foreground hover:underline"
                  >
                    {/* A fixed slot keeps names aligned whether or not a block has an icon. */}
                    <span className="inline-flex size-4 shrink-0 items-center justify-center">
                      {block.icon && <ModelIcon id={block.icon} size={16} />}
                    </span>
                    {block.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {BUILDING_BLOCK_KIND_LABEL[kindOf(block.__typename)]}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {block.architectureLevel
                    ? ARCHITECTURE_LEVEL_LABEL[block.architectureLevel]
                    : '—'}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {LIFECYCLE_LABEL[block.lifecyclePhase]}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {block.architectureDomainIds.length > 0
                    ? block.architectureDomainIds
                        .map((id) => domainNameById.get(id) ?? id)
                        .join(', ')
                    : '—'}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {block.organizationUnitLinks.length > 0
                    ? block.organizationUnitLinks
                        .map(
                          (l) =>
                            organizationUnitNameById.get(l.organizationUnitId) ??
                            l.organizationUnitId,
                        )
                        .join(', ')
                    : '—'}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                  {formatValidity(block.validFrom, block.validTo)}
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <WriteOnly>
                    <span className="inline-flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(block)}
                        aria-label={`Edit ${block.name}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="hover:text-destructive"
                        onClick={() => handleDelete(block)}
                        aria-label={`Delete ${block.name}`}
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  </WriteOnly>
                </td>
              </tr>
            ))}
            {filteredBlocks.length === 0 && (data?.buildingBlocks.length ?? 0) === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No building blocks yet.
                </td>
              </tr>
            )}
            {filteredBlocks.length === 0 && (data?.buildingBlocks.length ?? 0) > 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {search
                    ? `No building blocks match "${search}".`
                    : 'No building blocks match the selected filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {enterprise && (
        <BuildingBlockFormSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          enterpriseId={enterprise.id}
          block={editing}
          domains={domains}
          organizationUnits={organizationUnits}
          onSaved={() => void refetch()}
        />
      )}
    </div>
  );
}

export const Route = createFileRoute('/building-blocks/')({
  component: BuildingBlocksIndexRoute,
});
