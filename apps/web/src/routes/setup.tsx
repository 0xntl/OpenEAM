// Public page behind a setup link (D-19): the person the link was issued for
// sets their own password here. Reachable without a session — the root route
// lets this path through the sign-in gate — and the only way an account
// created by an admin ever gets a password.
import { gql } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Brand, PoweredBy } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';

const STATUS_QUERY = gql`
  query SetupTokenStatus($token: String!) {
    setupTokenStatus(token: $token) {
      valid
      purpose
      email
      displayName
    }
  }
`;

const COMPLETE_SETUP = gql`
  mutation CompletePasswordSetup($input: CompletePasswordSetupInput!) {
    completePasswordSetup(input: $input) {
      user {
        id
      }
    }
  }
`;

interface StatusData {
  setupTokenStatus: {
    valid: boolean;
    purpose: 'SETUP' | 'RESET' | null;
    email: string | null;
    displayName: string | null;
  };
}

const labelClassName = 'flex flex-col gap-1 text-xs font-medium text-muted-foreground';

function SetupRoute() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const { reload } = useAuth();
  const { data, loading } = useQuery<StatusData>(STATUS_QUERY, { variables: { token } });
  const [complete] = useMutation(COMPLETE_SETUP);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const status = data?.setupTokenStatus;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== repeat) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await complete({ variables: { input: { token, password } } });
      await reload();
      await navigate({ to: '/' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set the password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-xs"
      >
        <div>
          <h1 className="text-base font-semibold text-foreground">
            <Brand size="lg" />
          </h1>
          {loading && <p className="mt-0.5 text-xs text-muted-foreground">Checking the link…</p>}
          {status && !status.valid && (
            <p className="mt-0.5 text-sm text-destructive">
              This link is invalid, already used, or expired. Ask an instance admin for a new one.
            </p>
          )}
          {status?.valid && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {status.purpose === 'RESET' ? 'Choose a new password for ' : 'Welcome, '}
              <span className="font-medium text-foreground">{status.displayName}</span>
              {status.purpose === 'RESET' ? '.' : ' — choose the password you will sign in with.'}
              <br />
              {status.email}
            </p>
          )}
        </div>

        {status?.valid && (
          <>
            <label htmlFor="setup-password" className={labelClassName}>
              Password
              <Input
                id="setup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </label>
            <label htmlFor="setup-repeat" className={labelClassName}>
              Repeat password
              <Input
                id="setup-repeat"
                type="password"
                autoComplete="new-password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy || password.length < 8 || !repeat}>
              {status.purpose === 'RESET' ? 'Set new password' : 'Set password and sign in'}
            </Button>
          </>
        )}
      </form>
      <PoweredBy />
    </div>
  );
}

export const Route = createFileRoute('/setup')({
  validateSearch: (search: Record<string, unknown>): { token: string } => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  component: SetupRoute,
});
