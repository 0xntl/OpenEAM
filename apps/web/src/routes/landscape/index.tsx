import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import {
  EMPTY_LANDSCAPE_FILTERS,
  LandscapeFilters,
  type LandscapeFilterValues,
} from '@/components/landscape/landscape-filters';
import { contentWidthClassName, PageHeader } from '@/components/ui/page-header';
import { TableSkeleton } from '@/components/ui/skeletons';
import { useEnterprise } from '@/lib/enterprise';
import type {
  ArchitectureDomain,
  ArchitectureLevel,
  LifecyclePhase,
  OrganizationUnit,
} from '@/lib/entities';
import { ARCHITECTURE_LEVEL_LABEL, LIFECYCLE_LABEL } from '@/lib/labels';

const LANDSCAPE_QUERY = gql`
  query Landscape(
    $enterpriseId: String!
    $asOf: String
    $architectureLevel: ArchitectureLevel
    $architectureDomainId: String
    $organizationUnitId: String
  ) {
    architectureLandscape(
      enterpriseId: $enterpriseId
      asOf: $asOf
      architectureLevel: $architectureLevel
      architectureDomainId: $architectureDomainId
      organizationUnitId: $organizationUnitId
    ) {
      id
      name
      architectureLevel
      lifecyclePhase
      validFrom
      validTo
      realizedBy {
        solutionBuildingBlockId
        validFrom
        validTo
      }
    }
    solutionsLandscape(
      enterpriseId: $enterpriseId
      asOf: $asOf
      architectureDomainId: $architectureDomainId
      organizationUnitId: $organizationUnitId
    ) {
      id
      name
      lifecyclePhase
      validFrom
      validTo
    }
    allBuildingBlocks: buildingBlocks(enterpriseId: $enterpriseId) {
      id
      name
      lifecyclePhase
    }
    architectureDomains(enterpriseId: $enterpriseId) {
      id
      name
    }
    organizationUnits(enterpriseId: $enterpriseId) {
      id
      name
    }
  }
`;

interface LandscapeBlock {
  id: string;
  name: string;
  lifecyclePhase: string;
  validFrom?: string | null;
  validTo?: string | null;
}

interface RealizationLink {
  solutionBuildingBlockId: string;
  validFrom?: string | null;
  validTo?: string | null;
}

interface ArchitectureLandscapeBlock extends LandscapeBlock {
  architectureLevel: ArchitectureLevel | null;
  realizedBy: RealizationLink[];
}

interface LandscapeData {
  architectureLandscape: ArchitectureLandscapeBlock[];
  solutionsLandscape: LandscapeBlock[];
  allBuildingBlocks: Array<{ id: string; name: string; lifecyclePhase: string }>;
  architectureDomains: ArchitectureDomain[];
  organizationUnits: OrganizationUnit[];
}

// Mirrors the API's half-open interval check (validFrom inclusive, validTo
// exclusive; null = unbounded) so a realization link renders de-emphasized
// exactly when the backend would exclude it from the selected viewpoint.
function isValidAt(link: { validFrom?: string | null; validTo?: string | null }, asOf: string) {
  return (!link.validFrom || link.validFrom <= asOf) && (!link.validTo || link.validTo > asOf);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function LandscapeRoute() {
  const [filters, setFilters] = useState<LandscapeFilterValues>({
    ...EMPTY_LANDSCAPE_FILTERS,
    asOf: todayIso(),
  });

  const { enterprise } = useEnterprise();
  const { data, loading, error } = useQuery<LandscapeData>(LANDSCAPE_QUERY, {
    variables: {
      enterpriseId: enterprise?.id,
      asOf: filters.asOf || undefined,
      architectureLevel: filters.architectureLevel || undefined,
      architectureDomainId: filters.architectureDomainId || undefined,
      organizationUnitId: filters.organizationUnitId || undefined,
    },
    skip: !enterprise,
  });

  const blocksById = new Map((data?.allBuildingBlocks ?? []).map((b) => [b.id, b]));

  return (
    <div className={contentWidthClassName}>
      <PageHeader title="Landscape Table" />

      <div className="mb-6">
        <LandscapeFilters
          value={filters}
          onChange={setFilters}
          architectureDomains={data?.architectureDomains ?? []}
          organizationUnits={data?.organizationUnits ?? []}
        />
      </div>

      {loading && !data && <TableSkeleton />}
      {error && <p className="text-sm text-destructive">Failed to load the landscape.</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Architecture Landscape ({data?.architectureLandscape.length ?? 0})
          </h2>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Level</th>
                  <th className="px-3 py-2">Realized by</th>
                </tr>
              </thead>
              <tbody>
                {(data?.architectureLandscape ?? []).map((block) => (
                  <tr key={block.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium text-foreground">
                      <Link
                        to="/building-blocks/$buildingBlockId"
                        params={{ buildingBlockId: block.id }}
                        className="hover:underline"
                      >
                        {block.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {block.architectureLevel
                        ? ARCHITECTURE_LEVEL_LABEL[block.architectureLevel]
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {block.realizedBy.length === 0 ? (
                        '—'
                      ) : (
                        <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                          {block.realizedBy.map((r) => {
                            const solution = blocksById.get(r.solutionBuildingBlockId);
                            const outOfView = filters.asOf ? !isValidAt(r, filters.asOf) : false;
                            return (
                              <span
                                key={r.solutionBuildingBlockId}
                                className={
                                  outOfView ? 'italic text-muted-foreground/60' : undefined
                                }
                              >
                                {solution?.name ?? r.solutionBuildingBlockId}
                                {solution &&
                                  ` (${LIFECYCLE_LABEL[solution.lifecyclePhase as LifecyclePhase]})`}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {data?.architectureLandscape.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No architecture building blocks for this viewpoint.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Solutions Landscape ({data?.solutionsLandscape.length ?? 0})
          </h2>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Lifecycle</th>
                </tr>
              </thead>
              <tbody>
                {(data?.solutionsLandscape ?? []).map((block) => (
                  <tr key={block.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium text-foreground">
                      <Link
                        to="/building-blocks/$buildingBlockId"
                        params={{ buildingBlockId: block.id }}
                        className="hover:underline"
                      >
                        {block.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {LIFECYCLE_LABEL[block.lifecyclePhase as LifecyclePhase]}
                    </td>
                  </tr>
                ))}
                {data?.solutionsLandscape.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No solution building blocks for this viewpoint.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/landscape/')({
  component: LandscapeRoute,
});
