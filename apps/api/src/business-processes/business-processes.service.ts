import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Database } from '@openeam/db';
import { and, eq, inArray, schema } from '@openeam/db';
import { assertCan } from '../auth/policy';
import { assertEnterpriseAccess, type Principal } from '../auth/principal';
import { DATABASE } from '../db.module';
import { extractStepNames } from './bpmn-steps';
import type { BusinessProcess, BusinessProcessInput } from './business-process.model';

@Injectable()
export class BusinessProcessesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  findAll(principal: Principal, enterpriseId: string): Promise<BusinessProcess[]> {
    assertEnterpriseAccess(principal, enterpriseId);
    return this.db.query.businessProcesses.findMany({
      where: (t, { eq }) => eq(t.enterpriseId, enterpriseId),
      with: { steps: { orderBy: (t, { asc }) => [asc(t.position)] } },
    });
  }

  // A process lives in its capability's enterprise; the input carries no
  // enterpriseId of its own. The capability has to be one the caller can see.
  private async enterpriseIdOfCapability(
    principal: Principal,
    capabilityId: string,
  ): Promise<string> {
    const capability = await this.db.query.businessCapabilities.findFirst({
      where: (t, { and, eq, inArray }) =>
        and(eq(t.id, capabilityId), inArray(t.enterpriseId, principal.enterpriseIds)),
      columns: { enterpriseId: true },
    });
    if (!capability) throw new BadRequestException(`Capability ${capabilityId} not found`);
    return capability.enterpriseId;
  }

  // Scoped to the caller's enterprises (INV-16).
  findOne(principal: Principal, id: string): Promise<BusinessProcess | undefined> {
    return this.db.query.businessProcesses.findFirst({
      where: (t, { and, eq, inArray }) =>
        and(eq(t.id, id), inArray(t.enterpriseId, principal.enterpriseIds)),
      with: { steps: { orderBy: (t, { asc }) => [asc(t.position)] } },
    });
  }

  async updateDiagram(principal: Principal, id: string, bpmnXml: string): Promise<BusinessProcess> {
    const existing = await this.findOne(principal, id);
    if (!existing) throw new NotFoundException(`Business process ${id} not found`);
    assertCan(principal, 'model.write', existing.enterpriseId);

    let stepNames: string[];
    try {
      stepNames = await extractStepNames(bpmnXml);
    } catch (err) {
      throw new BadRequestException(
        `Invalid BPMN 2.0 XML: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.businessProcesses)
        .set({ bpmnXml })
        .where(
          and(
            eq(schema.businessProcesses.id, id),
            inArray(schema.businessProcesses.enterpriseId, principal.enterpriseIds),
          ),
        )
        .returning({ id: schema.businessProcesses.id });
      if (!updated) throw new NotFoundException(`Business process ${id} not found`);

      // The diagram is the source of truth for steps: replace them with the
      // named tasks extracted from the XML.
      await tx.delete(schema.processSteps).where(eq(schema.processSteps.processId, id));
      if (stepNames.length > 0) {
        await tx
          .insert(schema.processSteps)
          .values(stepNames.map((name, position) => ({ processId: id, name, position })));
      }
    });

    const process = await this.findOne(principal, id);
    if (!process) throw new NotFoundException(`Business process ${id} not found after update`);
    return process;
  }

  async create(principal: Principal, input: BusinessProcessInput): Promise<BusinessProcess> {
    const enterpriseId = await this.enterpriseIdOfCapability(principal, input.capabilityId);
    assertCan(principal, 'model.write', enterpriseId);
    const [inserted] = await this.db
      .insert(schema.businessProcesses)
      .values({
        enterpriseId,
        capabilityId: input.capabilityId,
        name: input.name,
        description: input.description ?? null,
        triggerEvent: input.triggerEvent ?? null,
        outcome: input.outcome ?? null,
      })
      .returning({ id: schema.businessProcesses.id });

    if (!inserted) throw new NotFoundException('Business process insert returned no row');
    const created = await this.findOne(principal, inserted.id);
    if (!created) {
      throw new NotFoundException(`Business process ${inserted.id} not found after creation`);
    }
    return created;
  }

  // INV-6 keeps enterpriseId in sync with the capability; since rows never
  // move between enterprises, the new capability has to sit in the same one.
  async update(
    principal: Principal,
    id: string,
    input: BusinessProcessInput,
  ): Promise<BusinessProcess> {
    const existing = await this.findOne(principal, id);
    if (!existing) throw new NotFoundException(`Business process ${id} not found`);
    assertCan(principal, 'model.write', existing.enterpriseId);
    const enterpriseId = await this.enterpriseIdOfCapability(principal, input.capabilityId);
    if (enterpriseId !== existing.enterpriseId) {
      throw new BadRequestException(
        'A process and its capability must belong to the same enterprise',
      );
    }

    await this.db
      .update(schema.businessProcesses)
      .set({
        enterpriseId,
        capabilityId: input.capabilityId,
        name: input.name,
        description: input.description ?? null,
        triggerEvent: input.triggerEvent ?? null,
        outcome: input.outcome ?? null,
      })
      .where(eq(schema.businessProcesses.id, id));

    const result = await this.findOne(principal, id);
    if (!result) {
      throw new NotFoundException(`Business process ${id} not found after update`);
    }
    return result;
  }

  async delete(principal: Principal, id: string): Promise<boolean> {
    const existing = await this.findOne(principal, id);
    if (!existing) return false;
    assertCan(principal, 'model.write', existing.enterpriseId);
    const [deleted] = await this.db
      .delete(schema.businessProcesses)
      .where(
        and(
          eq(schema.businessProcesses.id, id),
          inArray(schema.businessProcesses.enterpriseId, principal.enterpriseIds),
        ),
      )
      .returning({ id: schema.businessProcesses.id });
    return Boolean(deleted);
  }
}
