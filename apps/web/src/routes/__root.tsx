// The root route gates everything on a session: the sign-in page until
// there is one, then the app shell. Keeping the gate here, rather than as a
// redirect, means the URL someone opened survives signing in.
import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { AppShell } from '../components/app-shell';
import { BrandLoader, useDocumentBranding } from '../components/brand/brand';
import { SignInPage } from '../components/sign-in-page';
import { useAuth } from '../lib/auth';
import { EnterpriseProvider } from '../lib/enterprise';

// Paths that must work without a session: the setup page behind a one-time
// link (D-19). Rendered without the shell.
const PUBLIC_PATHS = ['/setup'];

function Root() {
  const { user } = useAuth();
  useDocumentBranding();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (PUBLIC_PATHS.includes(pathname)) return <Outlet />;
  // Initial `me` still loading: a quiet splash rather than a flash of the
  // sign-in form at someone who is already signed in.
  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        {/* The branding arrives with `me`, so the splash shows only the
            product's mark — never a name that might be the wrong one. */}
        <BrandLoader size="lg" label="Loading OpenEAM" />
      </div>
    );
  }
  if (user === null) return <SignInPage />;
  return (
    <EnterpriseProvider>
      <AppShell />
    </EnterpriseProvider>
  );
}

export const Route = createRootRoute({
  component: Root,
});
