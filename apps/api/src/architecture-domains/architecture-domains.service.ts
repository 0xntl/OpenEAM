import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@openeam/db';
import { assertEnterpriseAccess, type Principal } from '../auth/principal';
import { DATABASE } from '../db.module';
import type { ArchitectureDomain } from './architecture-domain.model';

@Injectable()
export class ArchitectureDomainsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  findAll(principal: Principal, enterpriseId: string): Promise<ArchitectureDomain[]> {
    assertEnterpriseAccess(principal, enterpriseId);
    return this.db.query.architectureDomains.findMany({
      where: (t, { eq }) => eq(t.enterpriseId, enterpriseId),
      orderBy: (t, { asc }) => [asc(t.name)],
    });
  }

  findOne(principal: Principal, id: string): Promise<ArchitectureDomain | undefined> {
    return this.db.query.architectureDomains.findFirst({
      where: (t, { and, eq, inArray }) =>
        and(eq(t.id, id), inArray(t.enterpriseId, principal.enterpriseIds)),
    });
  }
}
