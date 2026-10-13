// Home route ("/"): an at-a-glance overview of the current enterprise —
// headline counts, and anything that looks unfinished (a process with no
// diagram) so it's the first thing you see.
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import {
  Blocks,
  Library,
  type LucideIcon,
  Route as RouteIcon,
  Target,
  Users,
  Workflow,
} from 'lucide-react';
import { contentWidthClassName, PageHeader } from '@/components/ui/page-header';
import { useEnterprise } from '@/lib/enterprise';
import type { LifecyclePhase } from '@/lib/entities';
import { LIFECYCLE_LABEL } from '@/lib/labels';

const OVERVIEW_QUERY = gql`
  query EnterpriseOverview($enterpriseId: String!) {
    valueStreams(enterpriseId: $enterpriseId) {
      id
    }
    businessCapabilities(enterpriseId: $enterpriseId) {
      id
      name
    }
    businessProcesses(enterpriseId: $enterpriseId) {
      id
      name
      bpmnXml
    }
    buildingBlocks(enterpriseId: $enterpriseId) {
      id
      lifecyclePhase
      __typename
    }
    actors(enterpriseId: $enterpriseId) {
      id
    }
    informationObjects(enterpriseId: $enterpriseId) {
      id
    }
  }
`;

interface OverviewCapability {
  id: string;
  name: string;
}

interface OverviewProcess {
  id: string;
  name: string;
  bpmnXml?: string | null;
}

interface OverviewBuildingBlock {
  id: string;
  lifecyclePhase: string;
  __typename: 'ArchitectureBuildingBlock' | 'SolutionBuildingBlock';
}

interface OverviewData {
  valueStreams: { id: string }[];
  businessCapabilities: OverviewCapability[];
  businessProcesses: OverviewProcess[];
  buildingBlocks: OverviewBuildingBlock[];
  actors: { id: string }[];
  informationObjects: { id: string }[];
}

function StatTile({
  label,
  value,
  to,
  icon: Icon,
}: {
  label: string;
  value: number;
  to: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-md"
    >
      <span className="flex items-center justify-between text-xs text-muted-foreground">
        {label}
        <Icon className="size-4" strokeWidth={2} />
      </span>
      <span className="text-2xl font-semibold tracking-tight text-foreground">{value}</span>
    </Link>
  );
}

const LIFECYCLE_ORDER: LifecyclePhase[] = ['PLANNED', 'ACTIVE', 'PHASING_OUT', 'RETIRED'];
const LIFECYCLE_COLOR: Record<LifecyclePhase, string> = {
  PLANNED: 'bg-sky-500',
  ACTIVE: 'bg-emerald-500',
  PHASING_OUT: 'bg-amber-500',
  RETIRED: 'bg-neutral-400',
};

// One bar, four segments: the lifecycle mix of the whole landscape at a glance.
function LifecycleBar({ counts }: { counts: Partial<Record<LifecyclePhase, number>> }) {
  const total = LIFECYCLE_ORDER.reduce((sum, p) => sum + (counts[p] ?? 0), 0);
  if (total === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {LIFECYCLE_ORDER.filter((p) => (counts[p] ?? 0) > 0).map((p) => (
          <div
            key={p}
            className={LIFECYCLE_COLOR[p]}
            style={{ width: `${((counts[p] ?? 0) / total) * 100}%` }}
            title={`${LIFECYCLE_LABEL[p]}: ${counts[p]}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-foreground">
        {LIFECYCLE_ORDER.filter((p) => (counts[p] ?? 0) > 0).map((p) => (
          <span key={p} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${LIFECYCLE_COLOR[p]}`} />
            {LIFECYCLE_LABEL[p]} <span className="text-muted-foreground">{counts[p]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function HomeRoute() {
  const { enterprise, loading: enterpriseLoading } = useEnterprise();
  const { data, loading } = useQuery<OverviewData>(OVERVIEW_QUERY, {
    variables: { enterpriseId: enterprise?.id },
    skip: !enterprise,
  });

  const processesWithoutDiagram = (data?.businessProcesses ?? []).filter((p) => !p.bpmnXml);

  const lifecycleCounts = (data?.buildingBlocks ?? []).reduce<Record<string, number>>((acc, b) => {
    acc[b.lifecyclePhase] = (acc[b.lifecyclePhase] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className={contentWidthClassName}>
      <PageHeader title={enterprise?.name ?? 'Overview'} />

      {!enterpriseLoading && !enterprise && (
        <p className="text-sm text-muted-foreground">
          No enterprise yet — create one from the switcher in the sidebar to get started.
        </p>
      )}

      {enterprise?.goal && <p className="mb-6 text-sm text-muted-foreground">{enterprise.goal}</p>}

      {enterprise && (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile
              label="Value streams"
              value={data?.valueStreams.length ?? 0}
              to="/value-streams"
              icon={RouteIcon}
            />
            <StatTile
              label="Business capabilities"
              value={data?.businessCapabilities.length ?? 0}
              to="/capabilities"
              icon={Target}
            />
            <StatTile
              label="Business processes"
              value={data?.businessProcesses.length ?? 0}
              to="/business-processes"
              icon={Workflow}
            />
            <StatTile label="Actors" value={data?.actors.length ?? 0} to="/actors" icon={Users} />
            <StatTile
              label="Information"
              value={data?.informationObjects.length ?? 0}
              to="/information-objects"
              icon={Library}
            />
            <StatTile
              label="Building blocks"
              value={data?.buildingBlocks.length ?? 0}
              to="/building-blocks"
              icon={Blocks}
            />
          </div>

          {!loading && Object.keys(lifecycleCounts).length > 0 && (
            <div className="mb-8">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Building blocks by lifecycle
              </h2>
              <LifecycleBar counts={lifecycleCounts as Partial<Record<LifecyclePhase, number>>} />
            </div>
          )}

          {!loading && processesWithoutDiagram.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Needs attention
              </h2>
              <div className="flex flex-col gap-2">
                {processesWithoutDiagram.map((p) => (
                  <Link
                    key={p.id}
                    to="/business-processes/$processId"
                    params={{ processId: p.id }}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm hover:border-foreground/30"
                  >
                    <span className="text-foreground">{p.name}</span>
                    <span className="text-xs text-muted-foreground italic">No diagram yet</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const Route = createFileRoute('/')({
  component: HomeRoute,
});
