import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@openeam/db';
import { assertEnterpriseAccess, type Principal } from '../auth/principal';
import { DATABASE } from '../db.module';
import type { OrganizationUnit } from './organization-unit.model';

@Injectable()
export class OrganizationUnitsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // Returns the flat list; clients rebuild the tree from parentId.
  findAll(principal: Principal, enterpriseId: string): Promise<OrganizationUnit[]> {
    assertEnterpriseAccess(principal, enterpriseId);
    return this.db.query.organizationUnits.findMany({
      where: (t, { eq }) => eq(t.enterpriseId, enterpriseId),
      orderBy: (t, { asc }) => [asc(t.name)],
    });
  }

  findOne(principal: Principal, id: string): Promise<OrganizationUnit | undefined> {
    return this.db.query.organizationUnits.findFirst({
      where: (t, { and, eq, inArray }) =>
        and(eq(t.id, id), inArray(t.enterpriseId, principal.enterpriseIds)),
    });
  }
}
