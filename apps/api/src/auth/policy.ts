// The permission catalogue and the roles that bundle it (D-20). This is the
// only file that knows what a role means; services ask `can()` about a
// permission, never about a role, so the bundles can change — or become
// editable — without touching them.
import { ForbiddenException } from '@nestjs/common';
import type { Principal } from './principal';

export const PERMISSIONS = [
  // Read the model of an enterprise.
  'model.read',
  // Create, change and delete anything modelled in it.
  'model.write',
  // Export its model as a bundle.
  'data.export',
  // Replace its model from a bundle.
  'data.import',
  // Change the enterprise's own name, goal and colours.
  'enterprise.update',
  // Delete the enterprise and everything in it.
  'enterprise.delete',
  // Add and remove members and set their roles.
  'members.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type EnterpriseRole = 'owner' | 'editor' | 'viewer';

export const ENTERPRISE_ROLES: readonly EnterpriseRole[] = ['owner', 'editor', 'viewer'];

const ROLE_PERMISSIONS: Record<EnterpriseRole, readonly Permission[]> = {
  viewer: ['model.read', 'data.export'],
  editor: ['model.read', 'model.write', 'data.export'],
  owner: PERMISSIONS,
};

export function permissionsOf(role: EnterpriseRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

// Membership is the boundary (INV-16): no role, no permission at all. An
// instance admin holds an implicit owner membership in every enterprise
// (D-21), put there when the session is resolved, so this needs no special
// case.
export function can(principal: Principal, permission: Permission, enterpriseId: string): boolean {
  const role = principal.memberships[enterpriseId];
  return role !== undefined && ROLE_PERMISSIONS[role].includes(permission);
}

const DENIED: Record<Permission, string> = {
  'model.read': 'You are not a member of this enterprise',
  'model.write': 'Viewers cannot change the model — ask an owner for the editor role',
  'data.export': 'You are not a member of this enterprise',
  'data.import': 'Only an owner can replace an enterprise from a bundle',
  'enterprise.update': 'Only an owner can change the enterprise itself',
  'enterprise.delete': 'Only an owner can delete an enterprise',
  'members.manage': 'Only an owner can manage members',
};

export function assertCan(
  principal: Principal,
  permission: Permission,
  enterpriseId: string,
): void {
  if (!can(principal, permission, enterpriseId)) {
    throw new ForbiddenException(
      principal.memberships[enterpriseId] === undefined ? DENIED['model.read'] : DENIED[permission],
    );
  }
}
