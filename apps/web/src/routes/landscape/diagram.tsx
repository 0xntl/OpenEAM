import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { lazy, Suspense, useMemo, useState } from 'react';
import { BrandLoader } from '@/components/brand/brand';
import {
  EMPTY_LANDSCAPE_FILTERS,
  LandscapeFilters,
  type LandscapeFilterValues,
} from '@/components/landscape/landscape-filters';
import type {
  DiagramEdge,
  DiagramEdgeKind,
  DiagramNode,
} from '@/components/landscape/landscape-flow';
import { fullBleedCanvasClassName } from '@/components/ui/page-header';
import { useEnterprise } from '@/lib/enterprise';
import type {
  ArchitectureDomain,
  BuildingBlockRelationship,
  OrganizationUnit,
} from '@/lib/entities';

// React Flow + elkjs are heavy; only load them when this route is visited.
const LandscapeFlow = lazy(() => import('@/components/landscape/landscape-flow'));

// Architecture building blocks (needed capabilities) deliberately aren't
// queried or rendered here — this diagram is the concrete technical
// landscape (solution building blocks and how they relate/host each other),
// not the abstract capability layer. See docs discussion: an ABB like
// "Guest Communication" duplicates its business capability 1:1 and adds
// noise without adding a distinct fact to this view.
const LANDSCAPE_DIAGRAM_QUERY = gql`
  query LandscapeDiagram(
    $enterpriseId: String!
    $asOf: String
    $architectureDomainId: String
    $organizationUnitId: String
  ) {
    solutionsLandscape(
      enterpriseId: $enterpriseId
      asOf: $asOf
      architectureDomainId: $architectureDomainId
      organizationUnitId: $organizationUnitId
    ) {
      id
      name
      icon
      architectureDomainIds
      outgoingRelationships {
        id
        targetBuildingBlockId
        type
      }
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

interface LandscapeDiagramBlock {
  id: string;
  name: string;
  icon?: string | null;
  architectureDomainIds: string[];
  outgoingRelationships: Array<
    Pick<BuildingBlockRelationship, 'id' | 'targetBuildingBlockId' | 'type'>
  >;
}

interface LandscapeDiagramData {
  solutionsLandscape: LandscapeDiagramBlock[];
  architectureDomains: ArchitectureDomain[];
  organizationUnits: OrganizationUnit[];
}

const RELATIONSHIP_KIND_BY_TYPE: Record<BuildingBlockRelationship['type'], DiagramEdgeKind> = {
  DEPENDS_ON: 'depends_on',
  DATA_FLOW: 'data_flow',
  HOSTED_ON: 'hosted_on',
};

function toDiagramGraph(data: LandscapeDiagramData | undefined): {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
} {
  if (!data) return { nodes: [], edges: [] };

  const domainNameById = new Map(data.architectureDomains.map((d) => [d.id, d.name]));

  const nodes: DiagramNode[] = data.solutionsLandscape.map((b) => ({
    id: b.id,
    label: b.name,
    kind: 'solution' as const,
    icon: b.icon ?? undefined,
    domainName: b.architectureDomainIds[0]
      ? domainNameById.get(b.architectureDomainIds[0])
      : undefined,
  }));

  const edges: DiagramEdge[] = [];
  for (const block of data.solutionsLandscape) {
    for (const rel of block.outgoingRelationships) {
      edges.push({
        id: rel.id,
        sourceId: block.id,
        targetId: rel.targetBuildingBlockId,
        kind: RELATIONSHIP_KIND_BY_TYPE[rel.type],
      });
    }
  }

  return { nodes, edges };
}

function LandscapeDiagramRoute() {
  const [filters, setFilters] = useState<LandscapeFilterValues>({
    ...EMPTY_LANDSCAPE_FILTERS,
    asOf: new Date().toISOString().slice(0, 10),
  });

  const { enterprise } = useEnterprise();
  const navigate = useNavigate();

  const { data, loading, error } = useQuery<LandscapeDiagramData>(LANDSCAPE_DIAGRAM_QUERY, {
    variables: {
      enterpriseId: enterprise?.id,
      asOf: filters.asOf || undefined,
      architectureDomainId: filters.architectureDomainId || undefined,
      organizationUnitId: filters.organizationUnitId || undefined,
    },
    skip: !enterprise,
  });

  const { nodes, edges } = useMemo(() => toDiagramGraph(data), [data]);

  return (
    // Full-bleed: no max-width, no page header/title/toggle (the table
    // lives at its own nav entry now, see app-shell.tsx), and no padding of
    // its own beyond what cancels out <main>'s — this is the flagship view,
    // so it gets every pixel of the content area, flush on all four sides.
    <div className={fullBleedCanvasClassName}>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-card">
        {/* Floating glass toolbar. The canvas below reserves its height
            (pt-16), so the diagram is fitted into the space under the bar
            rather than behind it. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center px-4 pt-3">
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-4 rounded-xl border border-border/70 bg-background/80 px-4 py-2 text-foreground shadow-lg shadow-black/5 backdrop-blur-md dark:shadow-black/30">
            <h1 className="mr-1 text-sm font-semibold">Landscape</h1>
            <LandscapeFilters
              value={filters}
              onChange={setFilters}
              architectureDomains={data?.architectureDomains ?? []}
              organizationUnits={data?.organizationUnits ?? []}
              hideArchitectureLevel
            />
          </div>
        </div>
        {error && (
          <p className="px-4 py-2 text-xs text-destructive">Failed to load the landscape.</p>
        )}
        <div className="min-h-0 flex-1 pt-16">
          {loading && !data ? (
            <p className="p-4 text-xs text-muted-foreground italic">Loading…</p>
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center">
                  <BrandLoader label="Loading the diagram" />
                </div>
              }
            >
              <LandscapeFlow
                nodes={nodes}
                edges={edges}
                onNodeClick={(nodeId) =>
                  navigate({
                    to: '/building-blocks/$buildingBlockId',
                    params: { buildingBlockId: nodeId },
                  })
                }
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/landscape/diagram')({
  component: LandscapeDiagramRoute,
});
