// Who is making the request, resolved once per request by AuthGuard from the
// session and attached to the Express request. Services take it as their
// first argument and scope every query by `enterpriseIds` (INV-16); nothing
// below the resolver layer reads the session again.
import { ForbiddenException } from '@nestjs/common';
import type { EnterpriseRole } from './policy';

export type InstanceRole = 'admin' | 'user';

export interface Principal {
  userId: string;
  email: string;
  displayName: string;
  // Instance-level role (D-17). Admins manage accounts, sign-up and access to
  // enterprises; they read an enterprise's model only as a member of it.
  instanceRole: InstanceRole;
  // Enterprises the user is a member of, with their role in each (D-20).
  memberships: Record<string, EnterpriseRole>;
  // The keys of `memberships`, for scoping reads. Empty for a freshly
  // signed-up user with no enterprise yet; inArray() on an empty list yields
  // `false`, so scoped queries simply return nothing.
  enterpriseIds: string[];
}

// Records a membership gained during the request (an enterprise just created
// or imported) so the rest of the same request can see it.
export function grantMembership(principal: Principal, enterpriseId: string, role: EnterpriseRole) {
  principal.memberships[enterpriseId] = role;
  if (!principal.enterpriseIds.includes(enterpriseId)) principal.enterpriseIds.push(enterpriseId);
}

// For reads that name an enterprise explicitly (list queries). Entity
// lookups by id do not call this; they fold the membership check into the
// query's where clause and report an unknown id as not found, so an id from
// another enterprise is indistinguishable from one that does not exist.
// Writes use assertCan() from policy.ts instead.
export function assertEnterpriseAccess(principal: Principal, enterpriseId: string): void {
  if (!principal.enterpriseIds.includes(enterpriseId)) {
    throw new ForbiddenException('You are not a member of this enterprise');
  }
}

export function assertAdmin(principal: Principal): void {
  if (principal.instanceRole !== 'admin') {
    throw new ForbiddenException('Only an instance admin can do this');
  }
}

declare global {
  namespace Express {
    interface Request {
      principal?: Principal | null;
    }
  }
}
