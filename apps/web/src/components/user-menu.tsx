// Sidebar footer entry for the signed-in user: name when expanded, initials
// when collapsed; change password and sign out in the menu.
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useAuth } from '@/lib/auth';
import { initials } from '@/lib/labels';

const labelClassName = 'flex flex-col gap-1 text-xs font-medium text-muted-foreground';

function ChangePasswordSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCurrent('');
    setNext('');
    setRepeat('');
    setError(null);
  };

  const submit = async () => {
    if (next !== repeat) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Change password</SheetTitle>
          <SheetDescription>
            Every other session of yours is signed out once the password changes.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-6 py-2">
          <label htmlFor="pw-current" className={labelClassName}>
            Current password
            <Input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label htmlFor="pw-next" className={labelClassName}>
            New password
            <Input
              id="pw-next"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </label>
          <label htmlFor="pw-repeat" className={labelClassName}>
            Repeat new password
            <Input
              id="pw-repeat"
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <SheetFooter>
          <Button onClick={submit} disabled={busy || !current || !next || !repeat}>
            Change password
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function UserMenu() {
  const { user, signOut } = useAuth();
  const [passwordOpen, setPasswordOpen] = useState(false);
  if (!user) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              tooltip={user.displayName}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg border border-border bg-muted text-xs font-semibold text-foreground">
                {initials(user.displayName)}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5 leading-none">
                <span className="truncate font-medium">{user.displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            // See enterprise-switcher.tsx: prevents the trigger's focus
            // ring from lingering after picking an option.
            onCloseAutoFocus={(event) => event.preventDefault()}
            align="start"
            side="top"
            className="min-w-56"
          >
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5 font-medium">
                {user.displayName}
                {user.instanceRole === 'ADMIN' && (
                  <ShieldCheck
                    className="size-3.5 text-muted-foreground"
                    aria-label="Instance admin"
                  />
                )}
              </span>
              <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2" onSelect={() => setPasswordOpen(true)}>
              <KeyRound className="size-4 shrink-0" />
              Change password
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onSelect={() => void signOut()}>
              <LogOut className="size-4 shrink-0" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <ChangePasswordSheet open={passwordOpen} onOpenChange={setPasswordOpen} />
    </SidebarMenu>
  );
}
