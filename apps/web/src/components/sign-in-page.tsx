// Shown by the root route whenever there is no session. Sign-up is offered
// only when the API says it is open (first account, or AUTH_ALLOW_SIGNUP);
// otherwise the way in is being added to an enterprise by a member.
import { useState } from 'react';
import { Brand, PoweredBy } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';

type Mode = 'sign-in' | 'sign-up';

const labelClassName = 'flex flex-col gap-1 text-xs font-medium text-muted-foreground';

export function SignInPage() {
  const { signIn, signUp, signUpAllowed } = useAuth();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'sign-up') {
        await signUp(email, displayName, password);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    email.trim() !== '' && password !== '' && (mode === 'sign-in' || displayName.trim() !== '');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-xs"
      >
        <div>
          <h1 className="text-base font-semibold text-foreground">
            <Brand size="lg" />
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {mode === 'sign-up'
              ? signUpAllowed
                ? 'Create the account you will sign in with.'
                : 'Sign-up is closed on this instance.'
              : 'Sign in to your enterprises.'}
          </p>
        </div>

        <label htmlFor="auth-email" className={labelClassName}>
          Email
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </label>

        {mode === 'sign-up' && (
          <label htmlFor="auth-name" className={labelClassName}>
            Display name
            <Input
              id="auth-name"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
        )}

        <label htmlFor="auth-password" className={labelClassName}>
          Password
          <Input
            id="auth-password"
            type="password"
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={busy || !canSubmit}>
          {mode === 'sign-up' ? 'Create account' : 'Sign in'}
        </Button>

        {signUpAllowed && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            onClick={() => {
              setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up');
              setError(null);
            }}
          >
            {mode === 'sign-up' ? 'Already have an account? Sign in' : 'No account yet? Create one'}
          </button>
        )}
      </form>
      <PoweredBy />
    </div>
  );
}
