import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  contentWidthClassName,
  PageHeader,
  pageBackLinkClassName,
} from '@/components/ui/page-header';
import { DetailSkeleton } from '@/components/ui/skeletons';
import { ValueStreamDiagram } from '@/components/value-stream/diagram';
import {
  DELETE_VALUE_STREAM,
  ValueStreamFormSheet,
} from '@/components/value-stream/value-stream-form-sheet';
import { useConfirm } from '@/lib/confirm';
import { WriteOnly } from '@/lib/enterprise';
import type { ValueStream, ValueStreamCapability } from '@/lib/entities';
import { toast } from '@/lib/toast';

const VALUE_STREAM_QUERY = gql`
  query ValueStreamDetail($id: String!) {
    valueStream(id: $id) {
      id
      enterpriseId
      name
      description
      stages {
        id
        name
        capabilityIds
      }
    }
  }
`;

// Scoped to the value stream's own enterprise, not the switcher's current one,
// so a direct link renders correctly regardless of context.
const STREAM_CAPABILITIES_QUERY = gql`
  query ValueStreamCapabilities($enterpriseId: String!) {
    businessCapabilities(enterpriseId: $enterpriseId) {
      id
      name
      description
    }
  }
`;

interface ValueStreamDetailData {
  valueStream: (ValueStream & { enterpriseId: string }) | null;
}

interface StreamCapabilitiesData {
  businessCapabilities: ValueStreamCapability[];
}

function ValueStreamDetailRoute() {
  const { valueStreamId } = Route.useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data, loading, error, refetch } = useQuery<ValueStreamDetailData>(VALUE_STREAM_QUERY, {
    variables: { id: valueStreamId },
  });
  const enterpriseId = data?.valueStream?.enterpriseId;
  const { data: capsData } = useQuery<StreamCapabilitiesData>(STREAM_CAPABILITIES_QUERY, {
    variables: { enterpriseId },
    skip: !enterpriseId,
  });
  const [deleteValueStream] = useMutation(DELETE_VALUE_STREAM, {
    update(cache, _result, { variables }) {
      if (!variables?.id) return;
      cache.evict({ id: cache.identify({ __typename: 'ValueStream', id: variables.id }) });
      cache.gc();
    },
  });
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleDelete = async () => {
    if (
      !(await confirm({
        title: `Delete "${data?.valueStream?.name ?? 'this value stream'}"?`,
        destructive: true,
      }))
    )
      return;
    await deleteValueStream({ variables: { id: valueStreamId } });
    toast.success('Deleted.');
    navigate({ to: '/value-streams' });
  };

  if (loading)
    return (
      <div className={contentWidthClassName}>
        <DetailSkeleton />
      </div>
    );
  if (error)
    return <p className="px-6 py-8 text-sm text-destructive">Failed to load value stream.</p>;
  if (!data?.valueStream) throw notFound();

  const stream = data.valueStream;

  return (
    <div className={contentWidthClassName}>
      <PageHeader
        title={stream.name}
        back={
          <Link to="/value-streams" className={pageBackLinkClassName}>
            <ChevronLeft className="size-3.5" />
            Value Streams
          </Link>
        }
        action={
          <>
            <WriteOnly>
              <Button variant="ghost" size="sm" onClick={() => setSheetOpen(true)}>
                Edit
              </Button>
            </WriteOnly>
            <WriteOnly>
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                Delete
              </Button>
            </WriteOnly>
          </>
        }
      />

      {stream.description && (
        <p className="mb-4 text-sm text-muted-foreground">{stream.description}</p>
      )}

      <ValueStreamDiagram stream={stream} capabilities={capsData?.businessCapabilities ?? []} />

      <ValueStreamFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        enterpriseId={stream.enterpriseId}
        capabilities={capsData?.businessCapabilities ?? []}
        valueStream={stream}
        onSaved={refetch}
      />
    </div>
  );
}

export const Route = createFileRoute('/value-streams/$valueStreamId')({
  component: ValueStreamDetailRoute,
});
