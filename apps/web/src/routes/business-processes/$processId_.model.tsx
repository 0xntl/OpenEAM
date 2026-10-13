import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { lazy, Suspense, useCallback } from 'react';
import {
  canvasWidthClassName,
  PageHeader,
  pageBackLinkClassName,
} from '@/components/ui/page-header';
import { DetailSkeleton } from '@/components/ui/skeletons';

// bpmn-js is heavy; only load it when the editor route is visited.
const BpmnModeler = lazy(() => import('@/components/bpmn/bpmn-modeler'));

const PROCESS_DIAGRAM_QUERY = gql`
  query BusinessProcessDiagram($id: String!) {
    businessProcess(id: $id) {
      id
      name
      bpmnXml
    }
  }
`;

// Returning bpmnXml and steps keeps the normalized Apollo cache (and thus the
// detail page) in sync without a refetch.
const UPDATE_DIAGRAM_MUTATION = gql`
  mutation UpdateBusinessProcessDiagram($id: String!, $bpmnXml: String!) {
    updateBusinessProcessDiagram(id: $id, bpmnXml: $bpmnXml) {
      id
      bpmnXml
      steps {
        id
        name
      }
    }
  }
`;

interface ProcessDiagramData {
  businessProcess: { id: string; name: string; bpmnXml: string | null } | null;
}

function ModelBusinessProcessRoute() {
  const { processId } = Route.useParams();
  const { data, loading, error } = useQuery<ProcessDiagramData>(PROCESS_DIAGRAM_QUERY, {
    variables: { id: processId },
  });
  const [updateDiagram] = useMutation(UPDATE_DIAGRAM_MUTATION);

  const handleSave = useCallback(
    async (bpmnXml: string) => {
      await updateDiagram({ variables: { id: processId, bpmnXml } });
    },
    [updateDiagram, processId],
  );

  if (loading)
    return (
      <div className={canvasWidthClassName}>
        <DetailSkeleton />
      </div>
    );
  if (error) return <p className="px-6 py-8 text-sm text-destructive">Failed to load process.</p>;
  if (!data?.businessProcess) throw notFound();

  const process = data.businessProcess;

  return (
    // Canvas-tier width: no max-width, unlike content pages, so the modeler
    // gets the full available space. Header's natural height plus the
    // card's flex-1 fills the rest of the viewport.
    <div className={canvasWidthClassName}>
      <PageHeader
        className="mb-4 shrink-0"
        title={`${process.name} — Process Model`}
        back={
          <Link
            to="/business-processes/$processId"
            params={{ processId: process.id }}
            className={pageBackLinkClassName}
          >
            <ChevronLeft className="size-3.5" />
            {process.name}
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
        <Suspense
          fallback={<p className="p-4 text-xs text-muted-foreground italic">Loading editor…</p>}
        >
          <BpmnModeler xml={process.bpmnXml} onSave={handleSave} />
        </Suspense>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/business-processes/$processId_/model')({
  component: ModelBusinessProcessRoute,
});
