// Instance administration (D-17): the accounts on this instance, which
// enterprises each one reaches and as what (D-20), the sign-up switch and
// the instance branding (D-23).
// One table with a row menu, details in side sheets — the shape of every
// admin screen people already know.
import { gql } from '@apollo/client';
import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import { createFileRoute } from '@tanstack/react-router';
import {
  Check,
  Copy,
  KeyRound,
  MoreHorizontal,
  PanelLeft,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserPlus,
  UserRoundCheck,
  UserRoundX,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Brand, BrandIcon, BrandMark } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { contentWidthClassName, PageHeader } from '@/components/ui/page-header';
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
import { Switch } from '@/components/ui/switch';
import { apiBase } from '@/lib/apollo';
import {
  type BrandingSlot,
  brandingAssetUrl,
  type InstanceRole,
  PRODUCT_NAME,
  useAuth,
} from '@/lib/auth';
import { useConfirm } from '@/lib/confirm';
import {
  ENTERPRISE_ROLE_HINT,
  ENTERPRISE_ROLE_LABEL,
  type EnterpriseRole,
  useEnterprise,
} from '@/lib/enterprise';
import { formatDate, initials } from '@/lib/labels';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------- queries

const ADMIN_QUERY = gql`
  query Admin {
    instanceSettings {
      signUpOpen
      name
      logoVersion
      logoDarkVersion
      iconVersion
    }
    users {
      id
      email
      displayName
      instanceRole
      disabledAt
      createdAt
      hasPassword
      setupLinkExpiresAt
      memberships {
        enterpriseId
        enterpriseName
        role
      }
    }
  }
`;
const UPDATE_SETTINGS = gql`
  mutation UpdateInstanceSettings($input: InstanceSettingsInput!) {
    updateInstanceSettings(input: $input) {
      signUpOpen
      name
      logoVersion
      logoDarkVersion
      iconVersion
    }
  }
`;
const CREATE_USER = gql`
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      user {
        id
        displayName
      }
      token
      expiresAt
      purpose
    }
  }
`;
const CREATE_SETUP_LINK = gql`
  mutation CreatePasswordSetupLink($userId: String!) {
    createPasswordSetupLink(userId: $userId) {
      user {
        id
        displayName
      }
      token
      expiresAt
      purpose
    }
  }
`;
const SET_ROLE = gql`
  mutation SetUserRole($userId: String!, $role: InstanceRole!) {
    setUserRole(userId: $userId, role: $role) {
      id
    }
  }
`;
const SET_DISABLED = gql`
  mutation SetUserDisabled($userId: String!, $disabled: Boolean!) {
    setUserDisabled(userId: $userId, disabled: $disabled) {
      id
    }
  }
`;
const DELETE_USER = gql`
  mutation DeleteUser($userId: String!) {
    deleteUser(userId: $userId)
  }
`;
const ADD_MEMBER = gql`
  mutation AdminAddEnterpriseMember($enterpriseId: String!, $email: String!, $role: EnterpriseRole) {
    addEnterpriseMember(enterpriseId: $enterpriseId, email: $email, role: $role) {
      userId
    }
  }
`;
const SET_MEMBER_ROLE = gql`
  mutation AdminSetEnterpriseMemberRole(
    $enterpriseId: String!
    $userId: String!
    $role: EnterpriseRole!
  ) {
    setEnterpriseMemberRole(enterpriseId: $enterpriseId, userId: $userId, role: $role) {
      userId
    }
  }
`;
const REMOVE_MEMBER = gql`
  mutation AdminRemoveEnterpriseMember($enterpriseId: String!, $userId: String!) {
    removeEnterpriseMember(enterpriseId: $enterpriseId, userId: $userId) {
      userId
    }
  }
`;

// ----------------------------------------------------------------- types

type Access = EnterpriseRole | 'NONE';

interface Membership {
  enterpriseId: string;
  enterpriseName: string;
  role: EnterpriseRole;
}
interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  instanceRole: InstanceRole;
  disabledAt: string | null;
  createdAt: string;
  hasPassword: boolean;
  setupLinkExpiresAt: string | null;
  memberships: Membership[];
}
interface AdminData {
  instanceSettings: InstanceSettingsData;
  users: AdminUser[];
}
interface SetupLink {
  user: { id: string; displayName: string };
  token: string;
  expiresAt: string;
  purpose: 'SETUP' | 'RESET';
}
interface EnterpriseRef {
  id: string;
  name: string;
}

const ROLE_LABEL: Record<Access, string> = { ...ENTERPRISE_ROLE_LABEL, NONE: 'No access' };
const ROLE_HINT = ENTERPRISE_ROLE_HINT;
const ACCESS_OPTIONS: Access[] = ['OWNER', 'EDITOR', 'VIEWER', 'NONE'];

// --------------------------------------------------------------- helpers

interface InstanceSettingsData {
  signUpOpen: boolean;
  name: string | null;
  logoVersion: string | null;
  logoDarkVersion: string | null;
  iconVersion: string | null;
}

const LOGO_ACCEPT = 'image/svg+xml,image/png,image/jpeg,image/webp';

// One image slot of the branding: what is there now (or the product's
// default), and the controls to replace or remove it. Uploads go to
// PUT /api/branding/<slot> as raw bytes.
function AssetField({
  slot,
  label,
  hint,
  version,
  dark = false,
  fallback,
  busy,
  onUpload,
  onRemove,
}: {
  slot: BrandingSlot;
  label: string;
  hint: string;
  version: string | null;
  // Preview the image on a dark surface (the dark-mode logo).
  dark?: boolean;
  fallback: React.ReactNode;
  busy: boolean;
  onUpload: (slot: BrandingSlot, file: File) => void;
  onRemove: (slot: BrandingSlot) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const url = brandingAssetUrl(slot, version);
  return (
    <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <div
        className={cn(
          'flex h-14 items-center justify-center rounded-md border border-border px-3',
          dark ? 'bg-neutral-900 text-neutral-100' : 'bg-muted/30',
        )}
      >
        {url ? (
          <img
            src={url}
            alt=""
            className={cn('max-w-full object-contain', slot === 'icon' ? 'size-8' : 'h-8 w-auto')}
          />
        ) : (
          fallback
        )}
      </div>
      <div className="flex gap-2">
        <input
          ref={fileRef}
          type="file"
          accept={LOGO_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onUpload(slot, file);
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          {url ? 'Replace' : 'Upload'}
        </Button>
        {url && (
          <Button variant="ghost" size="sm" onClick={() => onRemove(slot)} disabled={busy}>
            Remove
          </Button>
        )}
      </div>
      <span className="font-normal">{hint}</span>
    </div>
  );
}

// Where the branding shows up, drawn with the real components so the admin
// sees the effect of a name before saving it and of an image right after
// uploading it. This is what makes the three inputs below legible: the name
// is the tab title and the text beside the mark, the logo replaces both, the
// icon stands in for the mark where there is no room for a name.
function BrandingPreview({ name }: { name: string }) {
  const { branding } = useAuth();
  const title = name.trim() || PRODUCT_NAME;
  const frame = 'flex flex-col gap-1.5 text-[10px] font-medium text-muted-foreground';
  const surface =
    'flex h-14 items-center overflow-hidden rounded-md border border-border bg-sidebar px-3 text-sidebar-foreground';
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
      <div className={frame}>
        Sidebar
        <div className={`${surface} justify-between gap-3`}>
          <Brand name={name} />
          <PanelLeft className="size-4 shrink-0 opacity-60" aria-hidden />
        </div>
      </div>
      <div className={frame}>
        Collapsed
        <div className={`${surface} w-14 justify-center px-0`}>
          <BrandIcon />
        </div>
      </div>
      <div className={frame}>
        Browser tab
        <div className="flex h-14 items-end rounded-md border border-border bg-muted/40 px-2 pt-2">
          <div className="flex h-9 max-w-full items-center gap-2 rounded-t-md border border-b-0 border-border bg-card px-3 text-xs text-foreground">
            {branding.iconUrl ? (
              <img src={branding.iconUrl} alt="" className="size-4 object-contain" />
            ) : (
              <BrandMark className="size-4" />
            )}
            <span className="truncate">{title}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Instance name and images (D-23). The name goes through GraphQL like the
// other settings; the images are bytes and go over REST. Both refresh `Me`
// afterwards, which is where every surface reads the branding from, so the
// sidebar changes while you watch.
function BrandingSection({
  settings,
  onChanged,
}: {
  settings: InstanceSettingsData;
  onChanged: () => Promise<unknown>;
}) {
  const client = useApolloClient();
  const [updateSettings] = useMutation(UPDATE_SETTINGS);
  const [name, setName] = useState(settings.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setName(settings.name ?? ''), [settings.name]);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await client.refetchQueries({ include: ['Me'] });
      await onChanged();
      toast.success(done);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveName = () =>
    run(
      () => updateSettings({ variables: { input: { name: name.trim() || null } } }),
      'Name saved.',
    );

  const upload = (slot: BrandingSlot, file: File) =>
    run(async () => {
      const res = await fetch(`${apiBase}/api/branding/${slot}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `Upload failed (${res.status})`);
      }
    }, 'Image updated.');

  const remove = (slot: BrandingSlot) =>
    run(async () => {
      const res = await fetch(`${apiBase}/api/branding/${slot}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Removing the image failed (${res.status})`);
    }, 'Image removed.');

  const dirty = (name.trim() || null) !== (settings.name ?? null);
  const hasLogo = settings.logoVersion !== null;

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Branding</p>
        <p className="text-xs text-muted-foreground">
          What people see as this instance's identity. By default that is the product's mark and
          name; a name of your own, a logo or an icon replace them piece by piece, as the preview
          shows.
        </p>
      </div>

      <div className="border-t border-border px-4 py-4">
        <BrandingPreview name={name} />
      </div>

      <div className="flex flex-col gap-5 border-t border-border px-4 py-4">
        <label
          htmlFor="branding-name"
          className="flex flex-col gap-1 text-xs font-medium text-muted-foreground"
        >
          Name
          <div className="flex max-w-md gap-2">
            <Input
              id="branding-name"
              value={name}
              maxLength={60}
              placeholder={`No name — ${PRODUCT_NAME} is shown`}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && dirty) void saveName();
              }}
            />
            <Button variant="outline" onClick={saveName} disabled={busy || !dirty}>
              Save
            </Button>
          </div>
          <span className="font-normal">
            The browser tab's title, and the text beside the mark wherever there is no logo.
            {dirty && ' Not saved yet — the preview shows it already.'}
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <AssetField
            slot="logo"
            label="Logo"
            hint={
              hasLogo
                ? 'Replaces the mark and the name in the sidebar and on the sign-in page. Shown 32 px tall; SVG, PNG, JPEG or WebP, up to 512 KB.'
                : 'Optional. Replaces the mark and the name in the sidebar and on the sign-in page; until then both are shown. 32 px tall, so a wide wordmark works best; SVG, PNG, JPEG or WebP, up to 512 KB.'
            }
            version={settings.logoVersion}
            fallback={
              <span className="text-xs font-normal text-muted-foreground">
                No logo — mark and name are shown
              </span>
            }
            busy={busy}
            onUpload={upload}
            onRemove={remove}
          />
          <AssetField
            slot="logo-dark"
            label="Logo for the dark theme"
            hint="Optional. Shown instead of the logo while the dark theme is on, for a logo that is unreadable on dark backgrounds."
            version={settings.logoDarkVersion}
            dark
            // Without a variant the dark theme shows the logo itself, so
            // preview exactly that: a logo that vanishes here will vanish
            // in the app too, and the admin sees it before anyone else does.
            fallback={
              hasLogo ? (
                <span className="inline-flex items-center gap-3 text-xs font-normal text-neutral-400">
                  <img
                    src={brandingAssetUrl('logo', settings.logoVersion) ?? undefined}
                    alt=""
                    className="h-6 w-auto max-w-32 object-contain"
                  />
                  No dark variant — the logo is shown as is
                </span>
              ) : (
                <span className="text-xs font-normal text-neutral-400">
                  No logo — mark and name are shown
                </span>
              )
            }
            busy={busy}
            onUpload={upload}
            onRemove={remove}
          />
          <AssetField
            slot="icon"
            label="Icon"
            hint="Optional, square. Replaces the mark as the favicon and in the collapsed sidebar, at 16 px."
            version={settings.iconVersion}
            fallback={
              <span className="text-xs font-normal text-muted-foreground">
                No icon — the product's mark is shown
              </span>
            }
            busy={busy}
            onUpload={upload}
            onRemove={remove}
          />
        </div>
      </div>
      {error && (
        <p className="border-t border-border px-4 py-2 text-sm text-destructive">{error}</p>
      )}
    </section>
  );
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'Something went wrong.';
}
function setupUrl(token: string) {
  return `${window.location.origin}/setup?token=${encodeURIComponent(token)}`;
}

const labelClassName = 'flex flex-col gap-1 text-xs font-medium text-muted-foreground';

// A sheet closes by its value becoming null; keep showing the last value so
// the content does not blank out while the sheet slides away.
function useRetained<T>(value: T | null): T | null {
  const [retained, setRetained] = useState<T | null>(value);
  if (value !== null && value !== retained) setRetained(value);
  return value ?? retained;
}

function Badge({
  children,
  tone = 'neutral',
  title,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'warning' | 'danger' | 'success';
  title?: string;
}) {
  const tones = {
    neutral: 'border-border text-muted-foreground',
    warning: 'border-amber-500/40 text-amber-700 dark:text-amber-400',
    danger: 'border-destructive/40 text-destructive',
    success: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400',
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Avatar({ name, muted }: { name: string; muted?: boolean }) {
  return (
    <div
      className={`flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold ${
        muted ? 'bg-muted text-muted-foreground' : 'bg-muted text-foreground'
      }`}
    >
      {initials(name)}
    </div>
  );
}

// One row per enterprise with the account's access as a select. Used for an
// existing account (changes apply immediately) and for a new one (collected
// and sent with the create mutation).
function AccessRows({
  enterprises,
  value,
  onChange,
  idPrefix,
}: {
  enterprises: EnterpriseRef[];
  value: Record<string, Access>;
  onChange: (enterpriseId: string, access: Access) => void;
  idPrefix: string;
}) {
  if (enterprises.length === 0) {
    return <p className="text-xs text-muted-foreground">No enterprise exists yet.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {enterprises.map((e) => {
        const access = value[e.id] ?? 'NONE';
        return (
          <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{e.name}</p>
              {access !== 'NONE' && (
                <p className="text-xs text-muted-foreground">{ROLE_HINT[access]}</p>
              )}
            </div>
            <Select value={access} onValueChange={(next) => onChange(e.id, next as Access)}>
              <SelectTrigger
                id={`${idPrefix}-${e.id}`}
                className="w-32"
                aria-label={`Access to ${e.name}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCESS_OPTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {ROLE_LABEL[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- sheets

function AccessSheet({
  user,
  enterprises,
  onClose,
  onChanged,
}: {
  user: AdminUser | null;
  enterprises: EnterpriseRef[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [addMember] = useMutation(ADD_MEMBER);
  const [setMemberRole] = useMutation(SET_MEMBER_ROLE);
  const [removeMember] = useMutation(REMOVE_MEMBER);
  const [error, setError] = useState<string | null>(null);
  const shown = useRetained(user);

  const current: Record<string, Access> = Object.fromEntries(
    (shown?.memberships ?? []).map((m) => [m.enterpriseId, m.role]),
  );

  const change = async (enterpriseId: string, next: Access) => {
    if (!user) return;
    const before = current[enterpriseId] ?? 'NONE';
    setError(null);
    try {
      if (next === 'NONE' && before !== 'NONE') {
        await removeMember({ variables: { enterpriseId, userId: user.id } });
      } else if (next !== 'NONE' && before === 'NONE') {
        await addMember({ variables: { enterpriseId, email: user.email, role: next } });
      } else if (next !== 'NONE') {
        await setMemberRole({ variables: { enterpriseId, userId: user.id, role: next } });
      }
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Sheet open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Access for {shown?.displayName}</SheetTitle>
          <SheetDescription>
            Which enterprises {shown?.displayName} can open, and what they may do there. Changes
            apply immediately.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-6 py-2">
          <AccessRows
            enterprises={enterprises}
            value={current}
            onChange={change}
            idPrefix="access"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SetupLinkSheet({ link, onClose }: { link: SetupLink | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const shown = useRetained(link);
  const url = shown ? setupUrl(shown.token) : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied.');
    } catch {
      setCopied(false);
    }
  };
  return (
    <Sheet
      open={link !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {shown?.purpose === 'RESET' ? 'Password reset link' : 'Setup link'} for{' '}
            {shown?.user.displayName}
          </SheetTitle>
          <SheetDescription>
            Hand this link to {shown?.user.displayName} directly. It works once, until{' '}
            {shown ? formatDate(shown.expiresAt) : ''}, and is not shown again. If it gets lost,
            issue a new one from the account's menu; the old one stops working.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-6 py-2">
          <Input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
            aria-label="Setup link"
          />
          <Button variant="outline" onClick={copy} className="self-start">
            {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CreateAccountSheet({
  open,
  enterprises,
  onClose,
  onCreated,
}: {
  open: boolean;
  enterprises: EnterpriseRef[];
  onClose: () => void;
  onCreated: (link: SetupLink) => void;
}) {
  const [createUser] = useMutation<{ createUser: SetupLink }>(CREATE_USER);
  const [form, setForm] = useState({ displayName: '', email: '', instanceRole: 'USER' });
  const [access, setAccess] = useState<Record<string, Access>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setForm({ displayName: '', email: '', instanceRole: 'USER' });
    setAccess({});
    setError(null);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await createUser({
        variables: {
          input: {
            email: form.email,
            displayName: form.displayName,
            instanceRole: form.instanceRole,
            memberships: Object.entries(access)
              .filter(([, a]) => a !== 'NONE')
              .map(([enterpriseId, role]) => ({ enterpriseId, role })),
          },
        },
      });
      reset();
      onClose();
      if (result.data) onCreated(result.data.createUser);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New account</SheetTitle>
          <SheetDescription>
            You will get a one-time setup link to hand over; the person chooses their own password
            through it.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-6 py-2">
          <label htmlFor="nu-name" className={labelClassName}>
            Name
            <Input
              id="nu-name"
              autoComplete="off"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              autoFocus
            />
          </label>
          <label htmlFor="nu-email" className={labelClassName}>
            Email
            <Input
              id="nu-email"
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label htmlFor="nu-role" className={labelClassName}>
            Instance role
            <Select
              value={form.instanceRole}
              onValueChange={(instanceRole) => setForm({ ...form, instanceRole })}
            >
              <SelectTrigger id="nu-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USER">User — reaches only the enterprises below</SelectItem>
                <SelectItem value="ADMIN">
                  Instance admin — runs accounts, owns every enterprise
                </SelectItem>
              </SelectContent>
            </Select>
          </label>
          {form.instanceRole === 'USER' && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">Access</p>
              <AccessRows
                enterprises={enterprises}
                value={access}
                onChange={(id, a) => setAccess({ ...access, [id]: a })}
                idPrefix="new-access"
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <SheetFooter>
          <Button onClick={submit} disabled={busy || !form.email || !form.displayName}>
            Create account
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ------------------------------------------------------------------ page

function statusOf(u: AdminUser): {
  label: string;
  tone: 'neutral' | 'warning' | 'danger' | 'success';
  title?: string;
} {
  if (u.disabledAt)
    return { label: 'Deactivated', tone: 'danger', title: `Since ${formatDate(u.disabledAt)}` };
  if (!u.hasPassword && u.setupLinkExpiresAt) {
    return {
      label: 'Awaiting setup',
      tone: 'warning',
      title: `Setup link valid until ${formatDate(u.setupLinkExpiresAt)}`,
    };
  }
  if (!u.hasPassword)
    return {
      label: 'No password',
      tone: 'warning',
      title: 'No valid setup link — issue a new one',
    };
  return { label: 'Active', tone: 'success' };
}

function AccountRow({
  user,
  isSelf,
  onAccess,
  onLink,
  onAction,
}: {
  user: AdminUser;
  isSelf: boolean;
  onAccess: () => void;
  onLink: () => void;
  onAction: (action: 'promote' | 'demote' | 'deactivate' | 'reactivate' | 'delete') => void;
}) {
  const status = statusOf(user);
  const disabled = Boolean(user.disabledAt);
  const admin = user.instanceRole === 'ADMIN';
  return (
    <tr className="group border-b border-border last:border-0 hover:bg-muted/40">
      <td className="py-2.5 pr-3 pl-4">
        <div className="flex items-center gap-3">
          <Avatar name={user.displayName} muted={disabled} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={`truncate text-sm font-medium ${disabled ? 'text-muted-foreground' : 'text-foreground'}`}
              >
                {user.displayName}
              </span>
              {isSelf && <span className="text-xs text-muted-foreground">you</span>}
            </div>
            <div className="truncate text-xs text-muted-foreground">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="py-2.5 pr-3">
        {admin ? (
          <Badge title="Runs accounts and sign-up; owner of every enterprise">
            <ShieldCheck className="mr-1 size-3" />
            Admin
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">User</span>
        )}
      </td>
      <td className="py-2.5 pr-3">
        <Badge tone={status.tone} title={status.title}>
          {status.label}
        </Badge>
      </td>
      <td className="py-2.5 pr-3">
        {admin ? (
          <span className="text-xs text-muted-foreground">All enterprises</span>
        ) : user.memberships.length === 0 ? (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={onAccess}
          >
            No access — grant
          </button>
        ) : (
          <button
            type="button"
            className="flex flex-wrap gap-1 text-left"
            onClick={onAccess}
            aria-label={`Manage access of ${user.displayName}`}
          >
            {user.memberships.map((m) => (
              <Badge key={m.enterpriseId}>
                {m.enterpriseName}
                <span className="ml-1 font-normal opacity-70">
                  {ROLE_LABEL[m.role].toLowerCase()}
                </span>
              </Badge>
            ))}
          </button>
        )}
      </td>
      <td className="py-2.5 pr-3 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.displayName}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            {!admin && (
              <DropdownMenuItem className="gap-2" onSelect={onAccess}>
                <Users className="size-4" />
                Manage access
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="gap-2" onSelect={onLink}>
              <KeyRound className="size-4" />
              {user.hasPassword ? 'New password reset link' : 'New setup link'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => onAction(admin ? 'demote' : 'promote')}
            >
              {admin ? <ShieldOff className="size-4" /> : <ShieldCheck className="size-4" />}
              {admin ? 'Remove instance admin' : 'Make instance admin'}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2"
              disabled={isSelf}
              onSelect={() => onAction(disabled ? 'reactivate' : 'deactivate')}
            >
              {disabled ? <UserRoundCheck className="size-4" /> : <UserRoundX className="size-4" />}
              {disabled ? 'Reactivate' : 'Deactivate'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-destructive focus:text-destructive"
              disabled={isSelf}
              onSelect={() => onAction('delete')}
            >
              <Trash2 className="size-4" />
              Delete account
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function AdminRoute() {
  const { user: me, isAdmin } = useAuth();
  const { enterprises } = useEnterprise();
  const { data, refetch } = useQuery<AdminData>(ADMIN_QUERY, { skip: !isAdmin });
  const [updateSettings] = useMutation(UPDATE_SETTINGS);
  const confirm = useConfirm();
  const [setRole] = useMutation(SET_ROLE);
  const [setDisabled] = useMutation(SET_DISABLED);
  const [deleteUser] = useMutation(DELETE_USER);
  const [createSetupLink] = useMutation<{ createPasswordSetupLink: SetupLink }>(CREATE_SETUP_LINK);

  const [createOpen, setCreateOpen] = useState(false);
  const [accessUser, setAccessUser] = useState<AdminUser | null>(null);
  const [link, setLink] = useState<SetupLink | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <div className={contentWidthClassName}>
        <PageHeader title="Administration" />
        <p className="text-sm text-muted-foreground">Only an instance admin can open this page.</p>
      </div>
    );
  }

  const users = data?.users ?? [];
  const signUpOpen = data?.instanceSettings.signUpOpen ?? false;
  const enterpriseRefs: EnterpriseRef[] = enterprises.map((e) => ({ id: e.id, name: e.name }));
  // Keep the sheet in sync with fresh data after a change.
  const accessUserLive = accessUser ? (users.find((u) => u.id === accessUser.id) ?? null) : null;

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await refetch();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const onAction = async (
    u: AdminUser,
    action: 'promote' | 'demote' | 'deactivate' | 'reactivate' | 'delete',
  ) => {
    switch (action) {
      case 'promote':
        return run(() => setRole({ variables: { userId: u.id, role: 'ADMIN' } }));
      case 'demote':
        return run(() => setRole({ variables: { userId: u.id, role: 'USER' } }));
      case 'deactivate':
        return run(() => setDisabled({ variables: { userId: u.id, disabled: true } }));
      case 'reactivate':
        return run(() => setDisabled({ variables: { userId: u.id, disabled: false } }));
      case 'delete':
        if (
          await confirm({
            title: `Delete the account of ${u.displayName}?`,
            description:
              'Their memberships go with it. Deactivating keeps everything and ends their sessions instead.',
            destructive: true,
          })
        ) {
          return run(() => deleteUser({ variables: { userId: u.id } }));
        }
    }
  };

  return (
    <div className={contentWidthClassName}>
      <PageHeader
        title="Administration"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus data-icon="inline-start" />
            New account
          </Button>
        }
      />

      <div className="flex flex-col gap-6">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Accounts</p>
              <p className="text-xs text-muted-foreground">
                Everyone who can sign in. Click the enterprises of an account to change its access.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">{users.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-t border-border text-sm">
              <thead>
                <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 pl-4 font-medium">Account</th>
                  <th className="py-2 pr-3 font-medium">Instance role</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Enterprises</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <AccountRow
                    key={u.id}
                    user={u}
                    isSelf={u.id === me?.id}
                    onAccess={() => setAccessUser(u)}
                    onLink={() =>
                      run(async () => {
                        const result = await createSetupLink({ variables: { userId: u.id } });
                        if (result.data) setLink(result.data.createPasswordSetupLink);
                      })
                    }
                    onAction={(action) => onAction(u, action)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {error && (
            <p className="border-t border-border px-4 py-2 text-sm text-destructive">{error}</p>
          )}
        </section>

        {data && <BrandingSection settings={data.instanceSettings} onChanged={refetch} />}

        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Open sign-up</p>
              <p className="text-xs text-muted-foreground">
                Let anyone who reaches this instance create an account. Off: accounts are created
                here and get a setup link.
              </p>
            </div>
            <Switch
              checked={signUpOpen}
              aria-label="Open sign-up"
              onCheckedChange={(checked) =>
                run(() => updateSettings({ variables: { input: { signUpOpen: checked } } }))
              }
            />
          </div>
        </section>
      </div>

      <AccessSheet
        user={accessUserLive}
        enterprises={enterpriseRefs}
        onClose={() => setAccessUser(null)}
        onChanged={() => void refetch()}
      />
      <SetupLinkSheet link={link} onClose={() => setLink(null)} />
      <CreateAccountSheet
        open={createOpen}
        enterprises={enterpriseRefs}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setLink(created);
          void refetch();
        }}
      />
    </div>
  );
}

export const Route = createFileRoute('/admin/')({
  component: AdminRoute,
});
