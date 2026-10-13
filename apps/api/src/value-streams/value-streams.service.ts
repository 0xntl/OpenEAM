import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Database, Transaction } from '@openeam/db';
import { and, eq, inArray, schema } from '@openeam/db';
import { assertCan } from '../auth/policy';
import { assertEnterpriseAccess, type Principal } from '../auth/principal';
import { DATABASE } from '../db.module';
import type { ValueStream, ValueStreamInput } from './value-stream.model';

// Stage order and each stage's capability order both come from their
// position in the input arrays — the wire format carries order implicitly,
// only the DB rows need an explicit position column. Shared by create and
// update, since update replaces a value stream's stages wholesale rather
// than diffing them (simplest correct approach for a small ordered list).
async function insertStages(
  tx: Transaction,
  valueStreamId: string,
  stages: ValueStreamInput['stages'],
): Promise<void> {
  for (const [stagePosition, stage] of stages.entries()) {
    const [insertedStage] = await tx
      .insert(schema.valueStreamStages)
      .values({ valueStreamId, name: stage.name, position: stagePosition })
      .returning({ id: schema.valueStreamStages.id });

    if (!insertedStage) throw new NotFoundException('Value stream stage insert returned no row');

    if (stage.capabilityIds.length > 0) {
      await tx.insert(schema.stageCapabilities).values(
        stage.capabilityIds.map((capabilityId, position) => ({
          stageId: insertedStage.id,
          capabilityId,
          position,
        })),
      );
    }
  }
}

interface StageRow {
  id: string;
  name: string;
  stageCapabilities: Array<{ capabilityId: string }>;
}

interface ValueStreamRow {
  id: string;
  enterpriseId: string;
  name: string;
  description: string | null;
  stages: StageRow[];
}

function toValueStream(row: ValueStreamRow): ValueStream {
  return {
    id: row.id,
    enterpriseId: row.enterpriseId,
    name: row.name,
    description: row.description,
    stages: row.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      capabilityIds: stage.stageCapabilities.map((sc) => sc.capabilityId),
    })),
  };
}

@Injectable()
export class ValueStreamsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findAll(principal: Principal, enterpriseId: string): Promise<ValueStream[]> {
    assertEnterpriseAccess(principal, enterpriseId);
    const rows = await this.db.query.valueStreams.findMany({
      where: (t, { eq }) => eq(t.enterpriseId, enterpriseId),
      with: {
        stages: {
          orderBy: (t, { asc }) => [asc(t.position)],
          with: { stageCapabilities: { orderBy: (t, { asc }) => [asc(t.position)] } },
        },
      },
    });
    return rows.map(toValueStream);
  }

  // Scoped to the caller's enterprises (INV-16).
  async findOne(principal: Principal, id: string): Promise<ValueStream | undefined> {
    const row = await this.db.query.valueStreams.findFirst({
      where: (t, { and, eq, inArray }) =>
        and(eq(t.id, id), inArray(t.enterpriseId, principal.enterpriseIds)),
      with: {
        stages: {
          orderBy: (t, { asc }) => [asc(t.position)],
          with: { stageCapabilities: { orderBy: (t, { asc }) => [asc(t.position)] } },
        },
      },
    });
    return row ? toValueStream(row) : undefined;
  }

  async create(principal: Principal, input: ValueStreamInput): Promise<ValueStream> {
    assertCan(principal, 'model.write', input.enterpriseId);
    await this.validateCapabilities(input, input.enterpriseId);
    const id = await this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(schema.valueStreams)
        .values({
          enterpriseId: input.enterpriseId,
          name: input.name,
          description: input.description ?? null,
        })
        .returning({ id: schema.valueStreams.id });

      if (!inserted) throw new NotFoundException('Value stream insert returned no row');

      await insertStages(tx, inserted.id, input.stages);
      return inserted.id;
    });

    const created = await this.findOne(principal, id);
    if (!created) throw new NotFoundException(`Value stream ${id} not found after creation`);
    return created;
  }

  async update(principal: Principal, id: string, input: ValueStreamInput): Promise<ValueStream> {
    const existing = await this.findOne(principal, id);
    if (!existing) throw new NotFoundException(`Value stream ${id} not found`);
    assertCan(principal, 'model.write', existing.enterpriseId);
    await this.validateCapabilities(input, existing.enterpriseId);

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.valueStreams)
        .set({ name: input.name, description: input.description ?? null })
        .where(eq(schema.valueStreams.id, id));

      // Full replace of stages/links rather than diffing them against the
      // existing set — simplest correct approach for a small ordered list,
      // and cascade delete takes stageCapabilities with their stage.
      await tx
        .delete(schema.valueStreamStages)
        .where(eq(schema.valueStreamStages.valueStreamId, id));
      await insertStages(tx, id, input.stages);
    });

    const updated = await this.findOne(principal, id);
    if (!updated) throw new NotFoundException(`Value stream ${id} not found after update`);
    return updated;
  }

  async delete(principal: Principal, id: string): Promise<boolean> {
    const existing = await this.findOne(principal, id);
    if (!existing) return false;
    assertCan(principal, 'model.write', existing.enterpriseId);
    const [deleted] = await this.db
      .delete(schema.valueStreams)
      .where(
        and(
          eq(schema.valueStreams.id, id),
          inArray(schema.valueStreams.enterpriseId, principal.enterpriseIds),
        ),
      )
      .returning({ id: schema.valueStreams.id });
    return Boolean(deleted);
  }

  // INV-9: every capability a stage points at belongs to the value stream's
  // own enterprise.
  private async validateCapabilities(input: ValueStreamInput, enterpriseId: string) {
    const ids = [...new Set(input.stages.flatMap((stage) => stage.capabilityIds))];
    if (ids.length === 0) return;
    const found = await this.db.query.businessCapabilities.findMany({
      where: (t, { and, eq, inArray }) => and(inArray(t.id, ids), eq(t.enterpriseId, enterpriseId)),
      columns: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException('Every capability must belong to this enterprise');
    }
  }
}
