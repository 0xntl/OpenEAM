import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { eq, schema } from '@openeam/db';
import { describe, expect, it } from '../harness';
import { diagram, expectRefusal, smallModel } from '../model';

describe("INV-6: a business process lives in its capability's enterprise", () => {
  it('refuses a capability that does not exist', async ({ world }) => {
    const { enterprise } = await smallModel(world, await world.enterprise());

    await expectRefusal(
      world.processes.create(enterprise.owner, { capabilityId: randomUUID(), name: 'Orphan' }),
      BadRequestException,
      /Capability .* not found/,
    );
  });

  it("takes its enterprise from the capability and cannot follow one into another's", async ({
    world,
  }) => {
    const here = await smallModel(world, await world.enterprise());
    const { owner } = here.enterprise;
    // The same person owns both enterprises, so only this rule is in the way.
    const elsewhere = await world.enterprise(owner);
    const sibling = await world.capabilities.create(owner, {
      enterpriseId: here.enterprise.id,
      name: 'Deliver',
    });
    const foreign = await world.capabilities.create(owner, {
      enterpriseId: elsewhere.id,
      name: 'Deliver',
    });
    expect(here.process.enterpriseId).toBe(here.enterprise.id);

    await expectRefusal(
      world.processes.update(owner, here.process.id, {
        capabilityId: foreign.id,
        name: 'Take an order',
      }),
      BadRequestException,
      /A process and its capability must belong to the same enterprise/,
    );
    const moved = await world.processes.update(owner, here.process.id, {
      capabilityId: sibling.id,
      name: 'Take an order',
    });
    expect(moved).toMatchObject({ capabilityId: sibling.id, enterpriseId: here.enterprise.id });
  });

  it('is refused by Postgres, whatever wrote the row', async ({ world }) => {
    const { enterprise, process } = await smallModel(world, await world.enterprise());
    const elsewhere = await world.enterprise(enterprise.owner);
    const moveTo = (enterpriseId: string) =>
      world.constraintViolatedBy((db) =>
        db
          .update(schema.businessProcesses)
          .set({ enterpriseId })
          .where(eq(schema.businessProcesses.id, process.id)),
      );

    expect(await moveTo(elsewhere.id)).toBe('business_processes_capability_fk');
    expect(await moveTo(enterprise.id)).toBeNull();
  });
});

describe('INV-7: bpmnXml parses as BPMN 2.0, and the steps are replaced from it on every save', () => {
  it('replaces the steps with the named tasks of the saved diagram, in flow order', async ({
    world,
  }) => {
    const { enterprise, process } = await smallModel(world, await world.enterprise());
    const first = diagram('Receive order', 'Check stock', 'Confirm');
    const second = diagram('Ship');
    const stepNames = (saved: { steps: Array<{ name: string }> }) => saved.steps.map((s) => s.name);

    const saved = await world.processes.updateDiagram(enterprise.owner, process.id, first);
    expect(saved.bpmnXml).toBe(first);
    expect(stepNames(saved)).toEqual(['Receive order', 'Check stock', 'Confirm']);

    // Replaced, not appended to.
    const savedAgain = await world.processes.updateDiagram(enterprise.owner, process.id, second);
    expect(savedAgain.bpmnXml).toBe(second);
    expect(stepNames(savedAgain)).toEqual(['Ship']);
  });

  const invalid: Array<[what: string, xml: string]> = [
    ['text that is not XML', 'Receive order, then ship it'],
    ['XML that is cut off', diagram('Receive order').slice(0, 200)],
    ['XML that is not BPMN', '<?xml version="1.0"?><order><item>Coffee</item></order>'],
  ];

  it.for(invalid)(
    'refuses %s and keeps the diagram and steps it had',
    async ([, xml], { world }) => {
      const { enterprise, process } = await smallModel(world, await world.enterprise());
      const valid = diagram('Receive order');
      await world.processes.updateDiagram(enterprise.owner, process.id, valid);

      await expectRefusal(
        world.processes.updateDiagram(enterprise.owner, process.id, xml),
        BadRequestException,
        /Invalid BPMN 2\.0 XML/,
      );
      const after = await world.processes.findOne(enterprise.owner, process.id);
      expect(after?.bpmnXml).toBe(valid);
      expect(after?.steps.map((s) => s.name)).toEqual(['Receive order']);
    },
  );
});
