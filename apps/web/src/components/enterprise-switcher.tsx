import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { Check, ChevronsUpDown, Pencil, Plus, Trash2, UserMinus } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/confirm';
import {
  ENTERPRISE_ROLE_HINT,
  ENTERPRISE_ROLE_LABEL,
  ENTERPRISE_ROLES,
  type Enterprise,
  type EnterpriseRole,
  type Permission,
  useEnterprise,
} from '@/lib/enterprise';
import { initials } from '@/lib/labels';
import { toast } from '@/lib/toast';

const CREATE_ENTERPRISE = gql`
  mutation CreateEnterprise($input: EnterpriseInput!) {
    createEnterprise(input: $input) {
      id
    }
  }
`;

const UPDATE_ENTERPRISE = gql`
  mutation UpdateEnterprise($id: String!, $input: EnterpriseInput!) {
    updateEnterprise(id: $id, input: $input) {
      id
    }
  }
`;

const DELETE_ENTERPRISE = gql`
  mutation DeleteEnterprise($id: String!) {
    deleteEnterprise(id: $id)
  }
`;

const MEMBERS_QUERY = gql`
  query EnterpriseMembers($id: String!) {
    enterprise(id: $id) {
      id
      myPermissions
      members {
        userId
        email
        displayName
        role
      }
    }
  }
`;

const ADD_MEMBER = gql`
  mutation AddEnterpriseMember($enterpriseId: String!, $email: String!, $role: EnterpriseRole) {
    addEnterpriseMember(enterpriseId: $enterpriseId, email: $email, role: $role) {
      userId
    }
  }
`;

const ACCOUNTS_QUERY = gql`
  query AccountsForMembers {
    accounts {
      id
      email
      displayName
    }
  }
`;

const SET_MEMBER_ROLE = gql`
  mutation SetEnterpriseMemberRole($enterpriseId: String!, $userId: String!, $role: EnterpriseRole!) {
    setEnterpriseMemberRole(enterpriseId: $enterpriseId, userId: $userId, role: $role) {
      userId
    }
  }
`;

const ROLE_LABEL = ENTERPRISE_ROLE_LABEL;
const ROLE_HINT = ENTERPRISE_ROLE_HINT;
const ROLES = ENTERPRISE_ROLES;

const REMOVE_MEMBER = gql`
  mutation RemoveEnterpriseMember($enterpriseId: String!, $userId: String!) {
    removeEnterpriseMember(enterpriseId: $enterpriseId, userId: $userId) {
      userId
      email
      displayName
    }
  }
`;

interface Member {
  userId: string;
  email: string;
  displayName: string;
  role: EnterpriseRole;
}

interface MembersData {
  enterprise: { id: string; myPermissions: Permission[]; members: Member[] } | null;
}

interface AccountsData {
  accounts: Array<{ id: string; email: string; displayName: string }>;
}

// Who can see this enterprise, and as what (D-20). Owners pick an existing
// account and a role; anyone may leave, the last owner cannot. Instance
// admins manage the same thing per account on the Administration page.
function MembersSection({ enterpriseId }: { enterpriseId: string }) {
  const { user } = useAuth();
  const { enterprises, refetch: refetchEnterprises } = useEnterprise();
  const { data, refetch } = useQuery<MembersData>(MEMBERS_QUERY, {
    variables: { id: enterpriseId },
  });
  const canManage = data?.enterprise?.myPermissions.includes('members.manage') ?? false;
  const { data: accountsData } = useQuery<AccountsData>(ACCOUNTS_QUERY, { skip: !canManage });
  const [addMember, { error: addError }] = useMutation(ADD_MEMBER);
  const confirm = useConfirm();
  const [removeMember, { error: removeError }] = useMutation(REMOVE_MEMBER);
  const [setMemberRole, { error: roleError }] = useMutation(SET_MEMBER_ROLE);
  const [role, setRole] = React.useState<EnterpriseRole>('EDITOR');

  const members = data?.enterprise?.members ?? [];
  const candidates = (accountsData?.accounts ?? []).filter(
    (a) => !members.some((m) => m.userId === a.id),
  );

  const handleAdd = async (accountId: string) => {
    const account = candidates.find((a) => a.id === accountId);
    if (!account) return;
    await addMember({ variables: { enterpriseId, email: account.email, role } });
    refetch();
  };

  const handleRole = async (member: Member, next: EnterpriseRole) => {
    await setMemberRole({ variables: { enterpriseId, userId: member.userId, role: next } });
    refetch();
    if (member.userId === user?.id) refetchEnterprises();
  };

  const handleRemove = async (member: Member) => {
    const self = member.userId === user?.id;
    const confirmed = await confirm(
      self
        ? {
            title: `Leave "${enterprises.find((e) => e.id === enterpriseId)?.name ?? 'this enterprise'}"?`,
            description: 'You will no longer see it. An owner can add you again.',
            confirmLabel: 'Leave',
            destructive: true,
          }
        : {
            title: `Remove ${member.displayName}?`,
            description: 'They will no longer see this enterprise.',
            confirmLabel: 'Remove',
            destructive: true,
          },
    );
    if (!confirmed) return;
    await removeMember({ variables: { enterpriseId, userId: member.userId } });
    if (self) {
      refetchEnterprises();
    } else {
      refetch();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className={labelClassName}>Members</p>
        <p className="text-xs text-muted-foreground">
          Who can open this enterprise, and what they may do in it.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {members.map((member) => {
          const self = member.userId === user?.id;
          return (
            <li key={member.userId} className="flex items-center gap-3 px-3 py-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-semibold text-foreground">
                {initials(member.displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {member.displayName}
                  {self && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">you</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
              </div>
              {canManage ? (
                <Select
                  value={member.role}
                  onValueChange={(next) => handleRole(member, next as EnterpriseRole)}
                >
                  <SelectTrigger className="w-28" aria-label={`Role of ${member.displayName}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {ROLE_LABEL[member.role]}
                </span>
              )}
              {(canManage || self) && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 hover:text-destructive"
                  aria-label={self ? 'Leave this enterprise' : `Remove ${member.displayName}`}
                  title={self ? 'Leave' : 'Remove'}
                  onClick={() => handleRemove(member)}
                >
                  <UserMinus />
                </Button>
              )}
            </li>
          );
        })}
        {canManage && (
          <li className="flex flex-col gap-1.5 bg-muted/40 px-3 py-2">
            <div className="flex gap-2">
              <Select value="" onValueChange={handleAdd} disabled={candidates.length === 0}>
                <SelectTrigger className="flex-1" aria-label="Add a member">
                  <SelectValue
                    placeholder={
                      candidates.length === 0
                        ? 'Every account is already a member'
                        : 'Add a member…'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.displayName}
                      <span className="ml-1 text-xs text-muted-foreground">{a.email}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={role} onValueChange={(next) => setRole(next as EnterpriseRole)}>
                <SelectTrigger className="w-28" aria-label="Role for the new member">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {ROLE_LABEL[role]}: {ROLE_HINT[role]}
            </p>
          </li>
        )}
      </ul>
      {(addError || removeError || roleError) && (
        <p className="text-sm text-destructive">
          {(addError ?? removeError ?? roleError)?.message}
        </p>
      )}
    </div>
  );
}

// Always set as inline style (never mixed with a Tailwind bg-*/text-*
// class) — falling back to var(--sidebar-primary...) rather than a
// literal color when unset, so an uncustomized avatar still resolves to
// the current theme's value instead of a fixed one. Inline style, even a
// var() reference, beats a plain (non-!important) class-based rule
// regardless of the ancestor's specificity tricks — which matters here:
// DropdownMenuItem forces every descendant's text color on hover/focus
// (see its `focus:**:text-accent-foreground`), and a Tailwind class on the
// avatar itself can't reliably out-specificity that without `!important`,
// which would then also block a real per-enterprise custom color.
function avatarStyle(e: Pick<Enterprise, 'avatarBgColor' | 'avatarTextColor'>) {
  return {
    backgroundColor: e.avatarBgColor || 'var(--sidebar-primary)',
    color: e.avatarTextColor || 'var(--sidebar-primary-foreground)',
  };
}

// A free-form bg/text color can end up close to the sidebar's own
// background in either theme (a white avatar in light mode, a black one in
// dark mode) — border-border is the app's themed "visible against the
// current surface" token (light grey on light, faint white-on-dark), so it
// keeps the avatar's edge legible regardless of what color was picked.
const AVATAR_BORDER = 'border border-border';

const labelClassName = 'flex flex-col gap-1 text-xs font-medium text-muted-foreground';

interface CreateEnterpriseData {
  createEnterprise: { id: string };
}

export function EnterpriseSwitcher() {
  const { enterprises, enterprise, setEnterpriseId, refetch } = useEnterprise();
  const [createEnterprise, { error: createError }] =
    useMutation<CreateEnterpriseData>(CREATE_ENTERPRISE);
  const [updateEnterprise, { error: updateError }] = useMutation(UPDATE_ENTERPRISE);
  const confirm = useConfirm();
  const [deleteEnterprise] = useMutation(DELETE_ENTERPRISE);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '',
    description: '',
    goal: '',
    avatarBgColor: '',
    avatarTextColor: '',
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', description: '', goal: '', avatarBgColor: '', avatarTextColor: '' });
    setSheetOpen(true);
  };

  const editing = enterprises.find((e) => e.id === editingId);
  const canUpdate = editingId
    ? (editing?.myPermissions?.includes('enterprise.update') ?? false)
    : true;

  const openEdit = (e: Enterprise) => {
    setEditingId(e.id);
    setForm({
      name: e.name,
      description: e.description ?? '',
      goal: e.goal ?? '',
      avatarBgColor: e.avatarBgColor ?? '',
      avatarTextColor: e.avatarTextColor ?? '',
    });
    setSheetOpen(true);
  };

  const handleSubmit = async () => {
    const input = {
      name: form.name,
      description: form.description || null,
      goal: form.goal || null,
      avatarBgColor: form.avatarBgColor || null,
      avatarTextColor: form.avatarTextColor || null,
    };
    if (editingId) {
      await updateEnterprise({ variables: { id: editingId, input } });
      setSheetOpen(false);
      refetch();
      return;
    }
    const result = await createEnterprise({ variables: { input } });
    setSheetOpen(false);
    refetch();
    const newId = result.data?.createEnterprise.id;
    if (newId) setEnterpriseId(newId);
  };

  // Cascades to every entity modeled within it (see enterprises.service.ts),
  // so this needs a clear, specific warning — not the generic one-liner
  // other list pages use for a single row. If the deleted enterprise was
  // the selected one, useEnterprise()'s own fallback (first remaining
  // enterprise, or null) takes over once refetch() drops it from the list.
  const handleDelete = async (e: Enterprise) => {
    const confirmed = await confirm({
      title: `Delete "${e.name}"?`,
      description:
        'This permanently deletes everything modelled in it — value streams, capabilities, processes, actors, information and building blocks. This cannot be undone.',
      destructive: true,
    });
    if (!confirmed) return;
    await deleteEnterprise({ variables: { id: e.id } });
    toast.success(`"${e.name}" deleted.`);
    refetch();
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div
                className={`flex aspect-square size-8 items-center justify-center rounded-lg text-xs font-semibold ${AVATAR_BORDER}`}
                style={avatarStyle(enterprise ?? {})}
              >
                {enterprise ? initials(enterprise.name) : '?'}
              </div>
              <div className="flex flex-col gap-0.5 leading-none min-w-0">
                <span className="text-xs text-muted-foreground">Enterprise</span>
                <span className="font-medium truncate">{enterprise?.name ?? 'No enterprise'}</span>
              </div>
              <ChevronsUpDown className="ml-auto shrink-0" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            // Radix returns focus to the trigger button when the menu
            // closes; unlike a mouse click, that's a programmatic focus()
            // call, which the browser's :focus-visible heuristic treats as
            // real keyboard focus — so the trigger's focus ring lingers
            // after picking an enterprise, even though nothing else in the
            // sidebar leaves a ring behind after a plain click.
            onCloseAutoFocus={(event) => event.preventDefault()}
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            align="start"
          >
            {enterprises.map((e: Enterprise) => (
              <DropdownMenuItem key={e.id} onSelect={() => setEnterpriseId(e.id)} className="gap-2">
                <div
                  className={`flex aspect-square size-6 shrink-0 items-center justify-center rounded text-xs font-semibold ${AVATAR_BORDER}`}
                  style={avatarStyle(e)}
                >
                  {initials(e.name)}
                </div>
                <span className="truncate">{e.name}</span>
                {e.id === enterprise?.id && <Check className="size-3.5 shrink-0" />}
                {/* Everyone may open the sheet to see members; the fields in
                    it only save for owners, so the pencil reads as "details"
                    for the rest. Deleting is owner-only outright. */}
                <button
                  type="button"
                  className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  aria-label={`Edit ${e.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    openEdit(e);
                  }}
                >
                  <Pencil className="size-3.5" />
                </button>
                {e.myPermissions?.includes('enterprise.delete') && (
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Delete ${e.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDelete(e);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </DropdownMenuItem>
            ))}
            {enterprises.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem className="gap-2" onSelect={openCreate}>
              <div className="flex size-6 items-center justify-center rounded border">
                <Plus className="size-3.5" />
              </div>
              Create enterprise
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingId ? 'Edit enterprise' : 'New enterprise'}</SheetTitle>
            <SheetDescription>
              The scope of an architecture effort: one or more organizations (or parts of them)
              pursuing a shared goal — a company, a cross-company collaboration, a household.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-6 py-2">
            <label htmlFor="ent-name" className={labelClassName}>
              Name
              <Input
                id="ent-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={!canUpdate}
                autoFocus={!editingId}
              />
            </label>

            <label htmlFor="ent-goal" className={labelClassName}>
              Shared goal
              <Input
                id="ent-goal"
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
                disabled={!canUpdate}
                placeholder="What this enterprise is pursuing together"
              />
              <span className="font-normal">
                Part of the definition, not documentation: if you cannot state the goal, the scope
                is not decided yet.
              </span>
            </label>

            <label htmlFor="ent-description" className={labelClassName}>
              Description
              <Textarea
                id="ent-description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                disabled={!canUpdate}
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <p className={labelClassName}>Appearance</p>
              <div className="flex items-center gap-4 rounded-lg border border-border px-3 py-3">
                <div
                  className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${AVATAR_BORDER}`}
                  style={avatarStyle({
                    avatarBgColor: form.avatarBgColor,
                    avatarTextColor: form.avatarTextColor,
                  })}
                  aria-hidden
                >
                  {form.name ? initials(form.name) : '?'}
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                  <label
                    htmlFor="ent-avatar-bg"
                    className="flex items-center gap-2 text-muted-foreground"
                  >
                    <input
                      id="ent-avatar-bg"
                      type="color"
                      className="size-6 cursor-pointer rounded border border-input bg-transparent p-0"
                      value={form.avatarBgColor || '#171717'}
                      onChange={(e) => setForm({ ...form, avatarBgColor: e.target.value })}
                      disabled={!canUpdate}
                    />
                    Background
                  </label>
                  <label
                    htmlFor="ent-avatar-text"
                    className="flex items-center gap-2 text-muted-foreground"
                  >
                    <input
                      id="ent-avatar-text"
                      type="color"
                      className="size-6 cursor-pointer rounded border border-input bg-transparent p-0"
                      value={form.avatarTextColor || '#ffffff'}
                      onChange={(e) => setForm({ ...form, avatarTextColor: e.target.value })}
                      disabled={!canUpdate}
                    />
                    Text
                  </label>
                  {(form.avatarBgColor || form.avatarTextColor) && canUpdate && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground hover:underline"
                      onClick={() => setForm({ ...form, avatarBgColor: '', avatarTextColor: '' })}
                    >
                      Reset to default
                    </button>
                  )}
                </div>
              </div>
            </div>

            {(createError || updateError) && (
              <p className="text-sm text-destructive">{(createError ?? updateError)?.message}</p>
            )}

            {editingId ? (
              <MembersSection enterpriseId={editingId} />
            ) : (
              <p className="text-xs text-muted-foreground">
                You will be the owner. Members can be added once the enterprise exists.
              </p>
            )}
          </div>

          <SheetFooter>
            {canUpdate ? (
              <Button onClick={handleSubmit} disabled={!form.name}>
                {editingId ? 'Save changes' : 'Create enterprise'}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only an owner can change the enterprise itself.
              </p>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </SidebarMenu>
  );
}
