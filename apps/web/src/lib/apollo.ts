// Apollo Client setup: talks to the API's /graphql endpoint (same-origin in dev
// via the Vite proxy, or VITE_API_URL in a build) with a normalized in-memory
// cache. The session travels in an httpOnly cookie, so requests always carry
// credentials; an UNAUTHENTICATED error from any query means the session is
// gone and the auth provider is told so it can show the sign-in page.
import {
  ApolloClient,
  ApolloLink,
  CombinedGraphQLErrors,
  HttpLink,
  InMemoryCache,
} from '@apollo/client';
import { ErrorLink } from '@apollo/client/link/error';
import { toast } from './toast';

// Also the base for the REST endpoints (data exchange, branding), so a build
// with VITE_API_URL set reaches the same API for both.
export const apiBase = import.meta.env.VITE_API_URL ?? '';

const unauthenticatedListeners = new Set<() => void>();

// Called by AuthProvider; returns an unsubscribe function.
export function onUnauthenticated(listener: () => void): () => void {
  unauthenticatedListeners.add(listener);
  return () => unauthenticatedListeners.delete(listener);
}

// A wrong password is also UNAUTHENTICATED; that one belongs to the form.
const AUTH_OPERATIONS = new Set(['SignIn', 'SignUp']);

// Mutations fired from a button rather than a form — deletes, unlinks,
// diagram saves — have no field to show an error under. Their failures go
// to a toast instead (lib/toast.tsx). Form mutations show
// their error in the sheet and are left alone.
const NOTICE_OPERATIONS = /^(Delete|Unlink|Remove|UpdateBusinessProcessDiagram)/;

const errorLink = new ErrorLink(({ error, operation }) => {
  if (!CombinedGraphQLErrors.is(error)) return;
  if (operation.operationName && AUTH_OPERATIONS.has(operation.operationName)) return;
  if (error.errors.some((e) => e.extensions?.code === 'UNAUTHENTICATED')) {
    for (const listener of unauthenticatedListeners) listener();
    return;
  }
  if (operation.operationName && NOTICE_OPERATIONS.test(operation.operationName)) {
    toast.error(error.errors[0]?.message ?? 'The change was not saved.');
  }
});

export const apolloClient = new ApolloClient({
  link: ApolloLink.from([
    errorLink,
    new HttpLink({ uri: `${apiBase}/graphql`, credentials: 'include' }),
  ]),
  cache: new InMemoryCache(),
});
