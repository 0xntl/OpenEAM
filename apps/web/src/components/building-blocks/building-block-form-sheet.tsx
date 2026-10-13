// The one form for creating and editing a building block, opened from the
// list (create and edit) and from the detail page (edit). Owns its state and
// the two mutations; errors show inside the sheet, under the fields.
import { gql } from '@apollo/client';
import { useMutation } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import { IconPicker } from '@/components/icons/icon-picker';
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
import type {
  ArchitectureDomain,
  ArchitectureLevel,
  BuildingBlock,
  BuildingBlockKind,
  LifecyclePhase,
  OrganizationUnit,
} from '@/lib/entities';
import {
  ARCHITECTURE_LEVEL_LABEL,
  ARCHITECTURE_LEVELS,
  BUILDING_BLOCK_KIND_LONG_LABEL,
  kindOf,
  LIFECYCLE_LABEL,
  LIFECYCLE_PHASES,
} from '@/lib/labels';
import { SELECT_EMPTY_VALUE } from '@/lib/utils';

const CREATE_BUILDING_BLOCK = gql`
  mutation CreateBuildingBlock($input: BuildingBlockInput!) {
    createBuildingBlock(input: $input) {
      id
    }
  }
`;
const UPDATE_BUILDING_BLOCK = gql`
  mutation UpdateBuildingBlock($id: String!, $input: BuildingBlockInput!) {
    updateBuildingBlock(id: $id, input: $input) {
      id
    }
  }
`;

interface FormState {
  kind: BuildingBlockKind;
  name: string;
  description: string;
  icon: string | null;
  architectureLevel: ArchitectureLevel | '';
  lifecyclePhase: LifecyclePhase;
  validFrom: string;
  validTo: string;
  architectureDomainIds: string[];
  organizationUnitIds: string[];
}

const emptyForm: FormState = {
  kind: 'ARCHITECTURE',
  name: '',
  description: '',
  icon: null,
  architectureLevel: '',
  lifecyclePhase: 'PLANNED',
  validFrom: '',
  validTo: '',
  architectureDomainIds: [],
  organizationUnitIds: [],
};

function toFormState(block: BuildingBlock): FormState {
  return {
    kind: kindOf(block.__typename),
    name: block.name,
    description: block.description ?? '',
    icon: block.icon ?? null,
    architectureLevel: block.architectureLevel ?? '',
    lifecyclePhase: block.lifecyclePhase,
    validFrom: block.validFrom ?? '',
    validTo: block.validTo ?? '',
    architectureDomainIds: block.architectureDomainIds,
    organizationUnitIds: block.organizationUnitLinks.map((l) => l.organizationUnitId),
  };
}

function BuildingBlockForm({
  form,
  setForm,
  domains,
  organizationUnits,
}: {
  form: FormState;
  setForm: (form: FormState) => void;
  domains: ArchitectureDomain[];
  organizationUnits: OrganizationUnit[];
}) {
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return (
    <div className="flex flex-col gap-4 px-6 py-2">
      <label
        htmlFor="bb-kind"
        className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
      >
        Kind
        <Select
          value={form.kind}
          onValueChange={(v) =>
            setForm({
              ...form,
              kind: v as BuildingBlockKind,
              architectureLevel: v === 'SOLUTION' ? '' : form.architectureLevel,
            })
          }
        >
          <SelectTrigger id="bb-kind" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ARCHITECTURE">
              {BUILDING_BLOCK_KIND_LONG_LABEL.ARCHITECTURE} (ABB)
            </SelectItem>
            <SelectItem value="SOLUTION">
              {BUILDING_BLOCK_KIND_LONG_LABEL.SOLUTION} (SBB)
            </SelectItem>
          </SelectContent>
        </Select>
      </label>

      <label
        htmlFor="bb-name"
        className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
      >
        Name
        <Input
          id="bb-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </label>

      <label
        htmlFor="bb-description"
        className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
      >
        Description
        <Textarea
          id="bb-description"
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>

      <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Icon
        <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
      </div>

      {form.kind === 'ARCHITECTURE' && (
        <label
          htmlFor="bb-architecture-level"
          className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
        >
          Architecture level
          <Select
            value={form.architectureLevel || SELECT_EMPTY_VALUE}
            onValueChange={(v) =>
              setForm({
                ...form,
                architectureLevel: v === SELECT_EMPTY_VALUE ? '' : (v as ArchitectureLevel),
              })
            }
          >
            <SelectTrigger id="bb-architecture-level" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SELECT_EMPTY_VALUE}>Not set</SelectItem>
              {ARCHITECTURE_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {ARCHITECTURE_LEVEL_LABEL[level]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      )}

      <label
        htmlFor="bb-lifecycle-phase"
        className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
      >
        Lifecycle phase
        <Select
          value={form.lifecyclePhase}
          onValueChange={(v) => setForm({ ...form, lifecyclePhase: v as LifecyclePhase })}
        >
          <SelectTrigger id="bb-lifecycle-phase" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LIFECYCLE_PHASES.map((phase) => (
              <SelectItem key={phase} value={phase}>
                {LIFECYCLE_LABEL[phase]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label
          htmlFor="bb-valid-from"
          className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
        >
          Valid from
          <Input
            id="bb-valid-from"
            type="date"
            value={form.validFrom}
            onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
          />
        </label>
        <label
          htmlFor="bb-valid-to"
          className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
        >
          Valid to
          <Input
            id="bb-valid-to"
            type="date"
            value={form.validTo}
            onChange={(e) => setForm({ ...form, validTo: e.target.value })}
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-xs font-medium text-muted-foreground">
          Architecture domains (at least one)
        </legend>
        <div className="flex flex-col gap-1 rounded-md border border-border p-2">
          {domains.map((domain) => (
            <label key={domain.id} className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={form.architectureDomainIds.includes(domain.id)}
                onChange={() =>
                  setForm({
                    ...form,
                    architectureDomainIds: toggle(form.architectureDomainIds, domain.id),
                  })
                }
              />
              {domain.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-xs font-medium text-muted-foreground">Organization units</legend>
        <div className="flex flex-col gap-1 rounded-md border border-border p-2">
          {organizationUnits.length === 0 && (
            <p className="text-xs text-muted-foreground">No organization units yet.</p>
          )}
          {organizationUnits.map((unit) => (
            <label key={unit.id} className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={form.organizationUnitIds.includes(unit.id)}
                onChange={() =>
                  setForm({
                    ...form,
                    organizationUnitIds: toggle(form.organizationUnitIds, unit.id),
                  })
                }
              />
              {unit.name}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

// What the sheet needs of a block to edit it; the list and the detail page
// both fetch at least this.
export type EditableBuildingBlock = Pick<
  BuildingBlock,
  | 'id'
  | '__typename'
  | 'name'
  | 'description'
  | 'icon'
  | 'architectureLevel'
  | 'lifecyclePhase'
  | 'validFrom'
  | 'validTo'
  | 'architectureDomainIds'
  | 'organizationUnitLinks'
>;

export function BuildingBlockFormSheet({
  open,
  onOpenChange,
  enterpriseId,
  block,
  domains,
  organizationUnits,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enterpriseId: string;
  // null creates a new block.
  block: EditableBuildingBlock | null;
  domains: ArchitectureDomain[];
  organizationUnits: OrganizationUnit[];
  onSaved: () => void;
}) {
  const [createBuildingBlock, { error: createError }] = useMutation(CREATE_BUILDING_BLOCK);
  const [updateBuildingBlock, { error: updateError }] = useMutation(UPDATE_BUILDING_BLOCK);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);

  // Reset to the block being edited each time the sheet opens.
  useEffect(() => {
    if (open) setForm(block ? toFormState(block as BuildingBlock) : emptyForm);
  }, [open, block]);

  const handleSubmit = async () => {
    const input = {
      enterpriseId,
      kind: form.kind,
      name: form.name,
      description: form.description || null,
      icon: form.icon,
      architectureLevel: form.kind === 'ARCHITECTURE' ? form.architectureLevel || null : null,
      lifecyclePhase: form.lifecyclePhase,
      validFrom: form.validFrom || null,
      validTo: form.validTo || null,
      architectureDomainIds: form.architectureDomainIds,
      organizationUnitIds: form.organizationUnitIds,
    };
    setBusy(true);
    try {
      if (block) {
        await updateBuildingBlock({ variables: { id: block.id, input } });
      } else {
        await createBuildingBlock({ variables: { input } });
      }
      onOpenChange(false);
      onSaved();
    } catch {
      // Shown below the fields via the mutation's error state.
    } finally {
      setBusy(false);
    }
  };

  const error = createError ?? updateError;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{block ? 'Edit building block' : 'New building block'}</SheetTitle>
          <SheetDescription>
            An ABB describes a needed capability; an SBB is what implements it.
          </SheetDescription>
        </SheetHeader>
        <BuildingBlockForm
          form={form}
          setForm={setForm}
          domains={domains}
          organizationUnits={organizationUnits}
        />
        {error && <p className="px-6 text-sm text-destructive">{error.message}</p>}
        <SheetFooter>
          <Button
            onClick={handleSubmit}
            disabled={busy || !form.name || form.architectureDomainIds.length === 0}
          >
            {block ? 'Save changes' : 'Create'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
