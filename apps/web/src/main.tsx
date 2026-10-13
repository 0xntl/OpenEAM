// Web entry point. Mounts the React SPA into #root, wrapping it with the Apollo
// (GraphQL) provider, the auth provider, and the TanStack Router. The
// enterprise provider lives in the root route, below the sign-in gate.
import { ApolloProvider } from '@apollo/client/react';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { apolloClient } from './lib/apollo';
import { AuthProvider } from './lib/auth';
import { ConfirmProvider } from './lib/confirm';
import { configureIconProvider } from './lib/icons';
import { ThemeProvider } from './lib/theme';
import { ToastProvider } from './lib/toast';
import { routeTree } from './routeTree.gen';

const router = createRouter({ routeTree });

// Model icons are fetched from this API, never from the public Iconify API.
configureIconProvider();

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root not found in index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider>
      <ApolloProvider client={apolloClient}>
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <RouterProvider router={router} />
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </ApolloProvider>
    </ThemeProvider>
  </StrictMode>,
);
