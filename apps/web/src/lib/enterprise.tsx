// Current-enterprise context: loads the enterprise list and tracks which one
// the user is working in (persisted in localStorage). Every scoped page reads
// the current enterprise from here and passes its id into GraphQL queries.
import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ENTERPRISES_QUERY = gql`
  query Enterprises {
    enterprises {
      id
      name
      description
      goal
      avatarBgColor
      avatarTextColor
      myRole
      myPermissions
    }
  }
`;

export type EnterpriseRole = 'OWNER' | 'EDITOR' | 'VIEWER';
export const ENTERPRISE_ROLES: EnterpriseRole[] = ['OWNER', 'EDITOR', 'VIEWER'];
export const ENTERPRISE_ROLE_LABEL: Record<EnterpriseRole, string> = {
  OWNER: 'Owner',
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
};
// One line each, used wherever a role is chosen.
export const ENTERPRISE_ROLE_HINT: Record<EnterpriseRole, string> = {
  OWNER: 'Everything: models, members, import, deleting the enterprise',
  EDITOR: 'Models the enterprise',
  VIEWER: 'Reads the enterprise',
};

// Mirrors the catalogue in apps/api/src/auth/policy.ts; the API decides,
// this only shows or hides controls.
export type Permission =
  | 'model.read'
  | 'model.write'
  | 'data.export'
  | 'data.import'
  | 'enterprise.update'
  | 'enterprise.delete'
  | 'members.manage';

export interface Enterprise {
  id: string;
  name: string;
  description?: string | null;
  goal?: string | null;
  avatarBgColor?: string | null;
  avatarTextColor?: string | null;
  myRole?: EnterpriseRole | null;
  myPermissions?: Permission[];
}

interface EnterprisesData {
  enterprises: Enterprise[];
}

interface EnterpriseContextValue {
  enterprises: Enterprise[];
  // null while loading or when no enterprise exists yet.
  enterprise: Enterprise | null;
  setEnterpriseId: (id: string) => void;
  refetch: () => void;
  loading: boolean;
  // Whether the signed-in user may do this in the current enterprise.
  can: (permission: Permission) => boolean;
}

const EnterpriseContext = createContext<EnterpriseContextValue | null>(null);

const STORAGE_KEY = 'enterpriseId';

export function EnterpriseProvider({ children }: { children: React.ReactNode }) {
  const { data, loading, refetch } = useQuery<EnterprisesData>(ENTERPRISES_QUERY);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );

  const enterprises = data?.enterprises ?? [];
  const enterprise = enterprises.find((e) => e.id === selectedId) ?? enterprises[0] ?? null;

  const setEnterpriseId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setSelectedId(id);
  }, []);

  const can = useCallback(
    (permission: Permission) => enterprise?.myPermissions?.includes(permission) ?? false,
    [enterprise],
  );

  const value = useMemo(
    () => ({ enterprises, enterprise, setEnterpriseId, refetch: () => refetch(), loading, can }),
    [enterprises, enterprise, setEnterpriseId, refetch, loading, can],
  );

  return <EnterpriseContext.Provider value={value}>{children}</EnterpriseContext.Provider>;
}

export function useEnterprise(): EnterpriseContextValue {
  const ctx = useContext(EnterpriseContext);
  if (!ctx) throw new Error('useEnterprise must be used within an EnterpriseProvider');
  return ctx;
}

// Renders its children only for members who may change the model (D-20).
// Every write control in the app sits inside one; the API enforces the same
// rule, this just keeps viewers from seeing buttons that would fail.
export function WriteOnly({ children }: { children: React.ReactNode }) {
  const { can } = useEnterprise();
  return can('model.write') ? children : null;
}
