import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { ACTOR_KIND_HINT, ACTOR_KIND_LABEL, ACTOR_KINDS } from '@/lib/actor';
import type { ActorKind } from '@/lib/entities';
import { SELECT_EMPTY_VALUE } from '@/lib/utils';

export const CREATE_ACTOR = gql`
  mutation CreateActor($input: ActorInput!) {
    createActor(input: $input) {
      id
    }
  }
`;

export const UPDATE_ACTOR = gql`
  mutation UpdateActor($id: String!, $input: ActorInput!) {
    updateActor(id: $id, input: $input) {
      id
    }
  }
`;

export const DELETE_ACTOR = gql`
  mutation DeleteActor($id: String!) {
    deleteActor(id: $id)
  }
`;

const ORGANIZATION_UNITS_QUERY = gql`
  query OrganizationUnitsForActor($enterpriseId: String!) {
    organizationUnits(enterpriseId: $enterpriseId) {
      id
      name
    }
  }
`;

interface OrganizationUnitsData {
  organizationUnits: Array<{ id: string; name: string }>;
}

export interface ActorFormValue {
  id: string;
  name: string;
  description?: string | null;
  kind: ActorKind;
  organizationUnitId?: string | null;
}

interface FormState {
  name: string;
  description: string;
  kind: ActorKind;
  organizationUnitId: string;
}

const emptyForm: FormState = {
  name: '',
  description: '',
  kind: 'ROLE',
  organizationUnitId: '',
};

// Shared create/edit sheet, same shape as the capability one: the actors list
// opens it in create mode (actor: null) or edit mode from a card; the actor
// detail page opens it in edit mode for the actor it's showing.
export function ActorFormSheet({
  open,
  onOpenChange,
  actor,
  enterpriseId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actor: ActorFormValue | null;
  enterpriseId: string;
  onSaved: () => void;
}) {
  const [createActor, { error: createError }] = useMutation(CREATE_ACTOR);
  const [updateActor, { error: updateError }] = useMutation(UPDATE_ACTOR);
  const [form, setForm] = useState<FormState>(emptyForm);
  const { data: unitsData } = useQuery<OrganizationUnitsData>(ORGANIZATION_UNITS_QUERY, {
    variables: { enterpriseId },
    skip: !enterpriseId,
  });

  useEffect(() => {
    if (!open) return;
    setForm(
      actor
        ? {
            name: actor.name,
            description: actor.description ?? '',
            kind: actor.kind,
            organizationUnitId: actor.organizationUnitId ?? '',
          }
        : emptyForm,
    );
  }, [open, actor]);

  const handleSubmit = async () => {
    const input = {
      enterpriseId,
      name: form.name,
      description: form.description || null,
      kind: form.kind,
      // The API rejects an organization unit on anything but a team (INV-13),
      // so drop it rather than sending a value the server will refuse.
      organizationUnitId: form.kind === 'TEAM' ? form.organizationUnitId || null : null,
    };
    if (actor) {
      await updateActor({ variables: { id: actor.id, input } });
    } else {
      await createActor({ variables: { input } });
    }
    onOpenChange(false);
    onSaved();
  };

  const mutationError = createError ?? updateError;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{actor ? 'Edit actor' : 'New actor'}</SheetTitle>
          <SheetDescription>
            Who is involved in delivering a capability. Usually a role or a team — those outlive the
            people in them.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-6 py-2">
          <label
            htmlFor="actor-name"
            className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
          >
            Name
            <Input
              id="actor-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <label
            htmlFor="actor-kind"
            className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
          >
            Kind
            <Select
              value={form.kind}
              onValueChange={(v) => setForm({ ...form, kind: v as ActorKind })}
            >
              <SelectTrigger id="actor-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTOR_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {ACTOR_KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="font-normal">{ACTOR_KIND_HINT[form.kind]}</span>
          </label>

          {form.kind === 'TEAM' && (
            <label
              htmlFor="actor-org-unit"
              className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
            >
              Organization unit
              <Select
                value={form.organizationUnitId || SELECT_EMPTY_VALUE}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    organizationUnitId: v === SELECT_EMPTY_VALUE ? '' : v,
                  })
                }
              >
                <SelectTrigger id="actor-org-unit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_EMPTY_VALUE}>Not set</SelectItem>
                  {unitsData?.organizationUnits.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="font-normal">
                Point a team at the unit that already models it, so the two never drift apart.
              </span>
            </label>
          )}

          <label
            htmlFor="actor-description"
            className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
          >
            Description
            <Textarea
              id="actor-description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
        </div>

        {mutationError && <p className="px-6 text-sm text-destructive">{mutationError.message}</p>}

        <SheetFooter>
          <Button onClick={handleSubmit} disabled={!form.name}>
            {actor ? 'Save changes' : 'Create'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
