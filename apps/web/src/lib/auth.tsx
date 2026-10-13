// Who is signed in. Loads `me` once, exposes sign-in/sign-up/sign-out, and
// drops the user when any request comes back UNAUTHENTICATED (expired or
// revoked session). The root route renders the sign-in page while `user` is
// null, so pages below it can assume a session exists.
import { gql } from '@apollo/client';
import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { apiBase, onUnauthenticated } from './apollo';

const ME_QUERY = gql`
  query Me {
    me {
      id
      email
      displayName
      instanceRole
    }
    authStatus {
      signUpAllowed
      instanceName
      logoVersion
      logoDarkVersion
      iconVersion
    }
  }
`;

const SIGN_IN = gql`
  mutation SignIn($input: SignInInput!) {
    signIn(input: $input) {
      user {
        id
        email
        displayName
      }
    }
  }
`;

const SIGN_UP = gql`
  mutation SignUp($input: SignUpInput!) {
    signUp(input: $input) {
      user {
        id
        email
        displayName
      }
    }
  }
`;

const SIGN_OUT = gql`
  mutation SignOut {
    signOut
  }
`;

const CHANGE_PASSWORD = gql`
  mutation ChangePassword($input: ChangePasswordInput!) {
    changePassword(input: $input)
  }
`;

export type InstanceRole = 'ADMIN' | 'USER';

// The software's own name, shown until an admin brands the instance (D-23)
// and in the "Powered by" line once they have.
export const PRODUCT_NAME = 'OpenEAM';

export type BrandingSlot = 'logo' | 'logo-dark' | 'icon';

export interface Branding {
  // The instance name, or the product's.
  name: string;
  // GET URLs of the uploaded images (versioned, so a new upload is a new
  // URL), or null where the slot is empty and the product's own mark shows.
  logoUrl: string | null;
  logoDarkUrl: string | null;
  iconUrl: string | null;
  // Whether an admin changed anything, which is when "Powered by" appears.
  custom: boolean;
}

export function brandingAssetUrl(slot: BrandingSlot, version: string | null): string | null {
  return version ? `${apiBase}/api/branding/${slot}?v=${encodeURIComponent(version)}` : null;
}

function toBranding(status: MeData['authStatus'] | undefined): Branding {
  const logoUrl = brandingAssetUrl('logo', status?.logoVersion ?? null);
  const logoDarkUrl = brandingAssetUrl('logo-dark', status?.logoDarkVersion ?? null);
  const iconUrl = brandingAssetUrl('icon', status?.iconVersion ?? null);
  return {
    name: status?.instanceName ?? PRODUCT_NAME,
    logoUrl,
    logoDarkUrl,
    iconUrl,
    // Typing the product's own name is not branding; only a different name
    // or an image makes the instance "someone's" and earns the attribution.
    custom:
      (status?.instanceName != null && status.instanceName !== PRODUCT_NAME) ||
      logoUrl !== null ||
      iconUrl !== null,
  };
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  instanceRole: InstanceRole;
}

interface MeData {
  me: User | null;
  authStatus: {
    signUpAllowed: boolean;
    instanceName: string | null;
    logoVersion: string | null;
    logoDarkVersion: string | null;
    iconVersion: string | null;
  };
}

interface AuthContextValue {
  // undefined while the initial `me` query is in flight.
  user: User | null | undefined;
  signUpAllowed: boolean;
  branding: Branding;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, displayName: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  // Re-reads `me` after a sign-in that happened outside this provider (the
  // setup page).
  reload: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = useApolloClient();
  const { data, loading, refetch } = useQuery<MeData>(ME_QUERY);
  const [signInMutation] = useMutation<{ signIn: { user: User } }>(SIGN_IN);
  const [signUpMutation] = useMutation<{ signUp: { user: User } }>(SIGN_UP);
  const [signOutMutation] = useMutation(SIGN_OUT);
  const [changePasswordMutation] = useMutation(CHANGE_PASSWORD);

  // Another session's data must not leak into this one, and a stale
  // cache would show a signed-out user the previous user's enterprises.
  const resetAndRefetch = useCallback(async () => {
    await client.clearStore();
    await refetch();
  }, [client, refetch]);

  // A lost session only needs `me` re-read (it comes back null); the cache
  // is cleared on the next sign-in, before another user's data loads.
  useEffect(() => onUnauthenticated(() => void refetch()), [refetch]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await signInMutation({ variables: { input: { email, password } } });
      await resetAndRefetch();
    },
    [signInMutation, resetAndRefetch],
  );

  const signUp = useCallback(
    async (email: string, displayName: string, password: string) => {
      await signUpMutation({ variables: { input: { email, displayName, password } } });
      await resetAndRefetch();
    },
    [signUpMutation, resetAndRefetch],
  );

  const signOut = useCallback(async () => {
    await signOutMutation();
    await resetAndRefetch();
  }, [signOutMutation, resetAndRefetch]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await changePasswordMutation({ variables: { input: { currentPassword, newPassword } } });
    },
    [changePasswordMutation],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: loading && !data ? undefined : (data?.me ?? null),
      signUpAllowed: data?.authStatus.signUpAllowed ?? false,
      branding: toBranding(data?.authStatus),
      signIn,
      signUp,
      signOut,
      changePassword,
      reload: resetAndRefetch,
      isAdmin: data?.me?.instanceRole === 'ADMIN',
    }),
    [data, loading, signIn, signUp, signOut, changePassword, resetAndRefetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
