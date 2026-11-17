// Smallest valid inputs and a small model to test against, so that a test
// spells out only the part its rule is about.
import { expect } from 'vitest';
import { ActorKind } from '../src/actors/actor.model';
import {
  type BuildingBlockInput,
  BuildingBlockKind,
  LifecyclePhase,
} from '../src/building-blocks/building-block.model';
import type { TestEnterprise, World } from './harness';

// A solution building block in the enterprise's first architecture domain.
export function blockInput(
  enterprise: TestEnterprise,
  overrides: Partial<BuildingBlockInput> = {},
): BuildingBlockInput {
  return {
    enterpriseId: enterprise.id,
    kind: BuildingBlockKind.SOLUTION,
    name: 'A building block',
    lifecyclePhase: LifecyclePhase.ACTIVE,
    architectureDomainIds: enterprise.domainIds.slice(0, 1),
    organizationUnitIds: [],
    ...overrides,
  };
}

// One of everything an enterprise can hold, written through the services
// by the enterprise's owner (the organization unit excepted, see harness.ts).
export async function smallModel(world: World, enterprise: TestEnterprise) {
  const { owner, id: enterpriseId } = enterprise;
  const abb = await world.buildingBlocks.create(
    owner,
    blockInput(enterprise, { kind: BuildingBlockKind.ARCHITECTURE, name: 'Order management' }),
  );
  const sbb = await world.buildingBlocks.create(owner, blockInput(enterprise, { name: 'Webshop' }));
  const capability = await world.capabilities.create(owner, { enterpriseId, name: 'Sell' });
  const process = await world.processes.create(owner, {
    capabilityId: capability.id,
    name: 'Take an order',
  });
  const informationObject = await world.informationObjects.create(owner, {
    enterpriseId,
    name: 'Order',
  });
  const actor = await world.actors.create(owner, {
    enterpriseId,
    kind: ActorKind.ROLE,
    name: 'Sales clerk',
  });
  const valueStream = await world.valueStreams.create(owner, {
    enterpriseId,
    name: 'Order to cash',
    stages: [{ name: 'Order', capabilityIds: [capability.id] }],
  });
  const organizationUnitId = await world.organizationUnit(enterpriseId);
  return {
    enterprise,
    abb,
    sbb,
    capability,
    process,
    informationObject,
    actor,
    valueStream,
    organizationUnitId,
  };
}

export type SmallModel = Awaited<ReturnType<typeof smallModel>>;

// A BPMN 2.0 diagram with the named tasks in sequence after a start event.
export function diagram(...taskNames: string[]): string {
  const tasks = taskNames.map((name, i) => `<bpmn:task id="task${i}" name="${name}" />`);
  const flows = taskNames.map(
    (_, i) =>
      `<bpmn:sequenceFlow id="flow${i}" sourceRef="${i === 0 ? 'start' : `task${i - 1}`}" targetRef="task${i}" />`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="definitions" targetNamespace="http://openeam.test/bpmn">
  <bpmn:process id="process">
    <bpmn:startEvent id="start" />
    ${[...tasks, ...flows].join('\n    ')}
  </bpmn:process>
</bpmn:definitions>`;
}

// The call has to be refused by the service, with this kind of error and
// this message. Both are checked on purpose: most rules have a database
// constraint behind them, and a test that accepted any failure would keep
// passing with the service's own check gone — or pass because some other
// rule refused first.
export async function expectRefusal(
  call: Promise<unknown>,
  type: abstract new (...args: never[]) => Error,
  message: RegExp,
): Promise<void> {
  const outcome = await call.then(
    () => 'it went through',
    (error: unknown) => error,
  );
  expect(outcome).toBeInstanceOf(type);
  expect((outcome as Error).message).toMatch(message);
}
