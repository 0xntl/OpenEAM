// The invariants on the importer's side. A bundle does not go through the
// services (D-16), so data-bundle.validator.ts checks the same rules for a
// whole bundle before anything is written. Each case below breaks one rule
// in an otherwise valid bundle of two enterprises and expects that rule,
// on that table, among the issues.
//
// The bundle is two of the public examples in one, read from disk: the
// validator is a function of the bundle alone, so these need no database.
// The last tests are the ones that show the importer actually asks it.
import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { DataBundle } from '../../src/data-exchange/data-bundle.schema';
import { validateBundle, validateDiagrams } from '../../src/data-exchange/data-bundle.validator';
import { exchange, overTheWire, parsedExample, tablesOf, withoutTimeOfExport } from '../bundles';
import { describe, expect, it } from '../harness';
import { smallModel } from '../model';

// Kestrel is the enterprise each case breaks a rule in; Alderbrook is the
// other one, for the rules about rows that must not cross between two.
function twoEnterprises(): { bundle: DataBundle; here: string; elsewhere: string } {
  const kestrel = parsedExample('kestrel.json');
  const alderbrook = parsedExample('alderbrook.json');
  const bundle = structuredClone(kestrel);
  for (const [table, rows] of tablesOf(alderbrook)) {
    (bundle[table as keyof DataBundle] as object[]).push(...structuredClone(rows));
  }
  const here = kestrel.enterprises[0]?.id;
  const elsewhere = alderbrook.enterprises[0]?.id;
  if (!here || !elsewhere) throw new Error('an example without an enterprise');
  return { bundle, here, elsewhere };
}

// The first row that fits, or a failed test if the examples no longer hold one.
function pick<T>(rows: T[], where: (row: T) => boolean = () => true): T {
  const row = rows.find(where);
  if (!row) throw new Error('the example bundles have no row this case needs');
  return row;
}

type Break = (bundle: DataBundle, here: string, elsewhere: string) => void;
type Case = [rule: string, table: string, message: RegExp, breakIt: Break];

const temporalTables = [
  'buildingBlocks',
  'buildingBlockOrganizationUnits',
  'buildingBlockRealizations',
  'buildingBlockCapabilities',
  'buildingBlockRelationships',
  'capabilityInformation',
  'capabilityActors',
] as const;

const of = (enterpriseId: string) => (row: { enterpriseId: string }) =>
  row.enterpriseId === enterpriseId;
const differentEnterprise = /belongs to a different enterprise/;
const secondOpenRow = /a second open row/;

const cases: Case[] = [
  ...temporalTables.map(
    (table): Case => [
      `INV-1: an empty interval in ${table}`,
      table,
      /validFrom must be earlier than validTo \(INV-1\)/,
      (b) => {
        const row = pick<{ validFrom: string | null; validTo: string | null }>(b[table]);
        row.validFrom = '2026-05-01';
        row.validTo = '2026-05-01';
      },
    ],
  ),
  [
    'INV-2: a building block in no architecture domain',
    'buildingBlocks',
    /at least one architecture domain \(INV-2\)/,
    (b, here) => {
      const block = pick(b.buildingBlocks, of(here));
      b.buildingBlockArchitectureDomains = b.buildingBlockArchitectureDomains.filter(
        (link) => link.buildingBlockId !== block.id,
      );
    },
  ],
  [
    'INV-3: an architecture level on a solution building block',
    'buildingBlocks',
    /architectureLevel only applies to architecture building blocks \(INV-3\)/,
    (b) => {
      pick(b.buildingBlocks, (block) => block.kind === 'solution').architectureLevel = 'segment';
    },
  ],
  [
    'INV-4: a relationship from a block to itself',
    'buildingBlockRelationships',
    /cannot relate to itself \(INV-4\)/,
    (b) => {
      const relationship = pick(b.buildingBlockRelationships);
      relationship.targetBuildingBlockId = relationship.sourceBuildingBlockId;
    },
  ],
  [
    'INV-5: two open hosted_on edges from one block',
    'buildingBlockRelationships',
    /a second open row for hosted_on .*\(INV-5\)/,
    (b) => {
      const host = pick(b.buildingBlockRelationships, (r) => r.type === 'hosted_on');
      host.validTo = null;
      b.buildingBlockRelationships.push({ ...host, id: randomUUID() });
    },
  ],
  [
    "INV-6: a process outside its capability's enterprise",
    'businessProcesses',
    /same enterprise as its capability \(INV-6\)/,
    (b, here, elsewhere) => {
      pick(b.businessProcesses, of(here)).enterpriseId = elsewhere;
    },
  ],
  [
    'INV-9: a row of an enterprise that is not in the bundle',
    'businessCapabilities',
    /which is not in the bundle/,
    (b) => {
      pick(b.businessCapabilities).enterpriseId = randomUUID();
    },
  ],
  [
    'INV-9: a link to a row that is not in the bundle',
    'buildingBlockCapabilities',
    /is not in the bundle's businessCapabilities/,
    (b) => {
      pick(b.buildingBlockCapabilities).capabilityId = randomUUID();
    },
  ],
  [
    "INV-9: a building block in another enterprise's architecture domain",
    'buildingBlockArchitectureDomains',
    differentEnterprise,
    (b, here, elsewhere) => {
      const block = pick(b.buildingBlocks, of(here));
      pick(
        b.buildingBlockArchitectureDomains,
        (link) => link.buildingBlockId === block.id,
      ).architectureDomainId = pick(b.architectureDomains, of(elsewhere)).id;
    },
  ],
  [
    "INV-9: a building block assigned to another enterprise's organization unit",
    'buildingBlockOrganizationUnits',
    differentEnterprise,
    (b, here, elsewhere) => {
      const hereBlocks = new Set(b.buildingBlocks.filter(of(here)).map((block) => block.id));
      pick(b.buildingBlockOrganizationUnits, (link) =>
        hereBlocks.has(link.buildingBlockId),
      ).organizationUnitId = pick(b.organizationUnits, of(elsewhere)).id;
    },
  ],
  [
    'INV-9: a relationship between building blocks of two enterprises',
    'buildingBlockRelationships',
    differentEnterprise,
    (b, here, elsewhere) => {
      const hereBlocks = new Set(b.buildingBlocks.filter(of(here)).map((block) => block.id));
      pick(b.buildingBlockRelationships, (r) =>
        hereBlocks.has(r.sourceBuildingBlockId),
      ).targetBuildingBlockId = pick(b.buildingBlocks, of(elsewhere)).id;
    },
  ],
  [
    'INV-9: a realization between building blocks of two enterprises',
    'buildingBlockRealizations',
    differentEnterprise,
    (b, here, elsewhere) => {
      const hereBlocks = new Set(b.buildingBlocks.filter(of(here)).map((block) => block.id));
      pick(b.buildingBlockRealizations, (r) =>
        hereBlocks.has(r.architectureBuildingBlockId),
      ).solutionBuildingBlockId = pick(
        b.buildingBlocks,
        (block) => block.enterpriseId === elsewhere && block.kind === 'solution',
      ).id;
    },
  ],
  [
    "INV-9: a value stream stage naming another enterprise's capability",
    'stageCapabilities',
    differentEnterprise,
    (b, here, elsewhere) => {
      const stream = pick(b.valueStreams, of(here));
      const stage = pick(b.valueStreamStages, (s) => s.valueStreamId === stream.id);
      pick(b.stageCapabilities, (sc) => sc.stageId === stage.id).capabilityId = pick(
        b.businessCapabilities,
        of(elsewhere),
      ).id;
    },
  ],
  [
    "INV-9: an organization unit under another enterprise's unit",
    'organizationUnits',
    differentEnterprise,
    (b, here, elsewhere) => {
      pick(b.organizationUnits, of(here)).parentId = pick(b.organizationUnits, of(elsewhere)).id;
    },
  ],
  [
    'INV-10: the same id twice in one table',
    'actors',
    /duplicate id within the bundle/,
    (b) => {
      b.actors.push({ ...pick(b.actors) });
    },
  ],
  [
    'INV-11: a capability linked to an information object of another enterprise',
    'capabilityInformation',
    differentEnterprise,
    (b, here, elsewhere) => {
      const capabilities = new Set(b.businessCapabilities.filter(of(here)).map((c) => c.id));
      pick(b.capabilityInformation, (link) =>
        capabilities.has(link.capabilityId),
      ).informationObjectId = pick(b.informationObjects, of(elsewhere)).id;
    },
  ],
  [
    'INV-12: two open links between a capability and an information object',
    'capabilityInformation',
    secondOpenRow,
    (b) => {
      const link = pick(b.capabilityInformation);
      link.validTo = null;
      b.capabilityInformation.push({ ...link, id: randomUUID() });
    },
  ],
  [
    'INV-13: an organization unit on an actor that is not a team',
    'actors',
    /applies only to actors of kind "team" \(INV-13\)/,
    (b, here) => {
      const actor = pick(b.actors, of(here));
      actor.kind = 'role';
      actor.organizationUnitId = pick(b.organizationUnits, of(here)).id;
    },
  ],
  [
    "INV-13: a team pointing at another enterprise's organization unit",
    'actors',
    differentEnterprise,
    (b, here, elsewhere) => {
      const actor = pick(b.actors, of(here));
      actor.kind = 'team';
      actor.organizationUnitId = pick(b.organizationUnits, of(elsewhere)).id;
    },
  ],
  [
    'INV-14: a capability linked to an actor of another enterprise',
    'capabilityActors',
    differentEnterprise,
    (b, here, elsewhere) => {
      const capabilities = new Set(b.businessCapabilities.filter(of(here)).map((c) => c.id));
      pick(b.capabilityActors, (link) => capabilities.has(link.capabilityId)).actorId = pick(
        b.actors,
        of(elsewhere),
      ).id;
    },
  ],
  [
    'INV-15: two open links between a capability and an actor',
    'capabilityActors',
    secondOpenRow,
    (b) => {
      const link = pick(b.capabilityActors);
      link.validTo = null;
      b.capabilityActors.push({ ...link, id: randomUUID() });
    },
  ],
  [
    'a realization whose solution side is an architecture building block',
    'buildingBlockRealizations',
    /solutionBuildingBlockId must point at a solution building block/,
    (b, here) => {
      const realization = pick(b.buildingBlockRealizations);
      const enterpriseId =
        pick(b.buildingBlocks, (block) => block.id === realization.architectureBuildingBlockId)
          .enterpriseId ?? here;
      realization.solutionBuildingBlockId = pick(
        b.buildingBlocks,
        (block) =>
          block.enterpriseId === enterpriseId &&
          block.kind === 'architecture' &&
          block.id !== realization.architectureBuildingBlockId,
      ).id;
    },
  ],
  [
    'an organization unit that is its own ancestor',
    'organizationUnits',
    /parentId chain forms a cycle/,
    (b) => {
      const unit = pick(b.organizationUnits);
      unit.parentId = unit.id;
    },
  ],
  [
    'two process steps in the same position',
    'processSteps',
    /position \d+ is used twice under the same parent/,
    (b) => {
      b.processSteps.push({ ...pick(b.processSteps), id: randomUUID() });
    },
  ],
];

describe('the importer applies the invariants to a whole bundle', () => {
  it('finds nothing wrong with the two examples as they are', async () => {
    const { bundle } = twoEnterprises();

    expect(validateBundle(bundle)).toEqual([]);
    expect(await validateDiagrams(bundle)).toEqual([]);
  });

  it.for(cases)('%s', ([, table, message, breakIt]) => {
    const { bundle, here, elsewhere } = twoEnterprises();

    breakIt(bundle, here, elsewhere);

    expect(validateBundle(bundle)).toContainEqual(
      expect.objectContaining({ table, message: expect.stringMatching(message) }),
    );
  });

  it('refuses the whole bundle with every issue listed, and writes none of it', async ({
    world,
  }) => {
    const { enterprise, sbb, capability } = await smallModel(world, await world.enterprise());
    const endpoint = exchange(world);
    const exported = await endpoint.export(enterprise.owner);
    const broken = overTheWire(exported) as unknown as DataBundle;
    // Two rules at once, in a bundle that also carries a harmless change.
    pick(broken.enterprises).name = 'Renamed by the bundle';
    pick(broken.buildingBlocks, (block) => block.id === sbb.id).architectureLevel = 'segment';
    pick(broken.businessCapabilities, (c) => c.id === capability.id).enterpriseId = randomUUID();

    const outcome = await endpoint.import(enterprise.owner, broken).then(
      () => 'it went through',
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(BadRequestException);
    expect((outcome as BadRequestException).getResponse()).toMatchObject({
      message: 'The bundle violates model rules',
      issues: expect.arrayContaining([
        expect.objectContaining({ table: 'buildingBlocks', id: sbb.id }),
        expect.objectContaining({ table: 'businessCapabilities', id: capability.id }),
      ]),
    });
    expect(withoutTimeOfExport(await endpoint.export(enterprise.owner))).toEqual(
      withoutTimeOfExport(exported),
    );
  });

  // INV-7 is checked apart from the rest (validateDiagrams): parsing BPMN is
  // asynchronous. The importer asks both and answers with one list.
  it('refuses a process whose diagram is not BPMN 2.0 (INV-7)', async ({ world }) => {
    const { enterprise, process } = await smallModel(world, await world.enterprise());
    const endpoint = exchange(world);
    const broken = overTheWire(await endpoint.export(enterprise.owner)) as unknown as DataBundle;
    pick(broken.businessProcesses, (p) => p.id === process.id).bpmnXml = 'Receive order, then ship';

    const outcome = await endpoint.import(enterprise.owner, broken).then(
      () => 'it went through',
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(BadRequestException);
    expect((outcome as BadRequestException).getResponse()).toMatchObject({
      message: 'The bundle violates model rules',
      issues: [
        expect.objectContaining({
          table: 'businessProcesses',
          id: process.id,
          message: expect.stringMatching(/bpmnXml is not BPMN 2\.0 \(INV-7\)/),
        }),
      ],
    });
    const stored = await world.processes.findOne(enterprise.owner, process.id);
    expect(stored?.bpmnXml ?? null).toBeNull();
  });
});

// The diagram is where a process's steps come from (INV-7), and a bundle
// carries both. One that says two different things is refused, not
// corrected: the importer writes what a bundle holds or nothing (D-30).
describe('the importer holds process steps to the diagram (INV-7)', () => {
  const notTheDiagram = /its processSteps are not the named tasks of its diagram \(INV-7\)/;

  // Alderbrook has the one process with a diagram among the public examples.
  function withDiagram() {
    const bundle = structuredClone(parsedExample('alderbrook.json'));
    const process = pick(bundle.businessProcesses, (p) => Boolean(p.bpmnXml));
    const steps = bundle.processSteps
      .filter((step) => step.processId === process.id)
      .sort((x, y) => x.position - y.position);
    if (steps.length < 2) throw new Error('the example diagram has fewer than two named tasks');
    return { bundle, process, steps };
  }

  const breaks: [how: string, breakIt: (given: ReturnType<typeof withDiagram>) => void][] = [
    [
      'a step renamed',
      ({ steps }) => {
        pick(steps).name = 'Something the diagram does not say';
      },
    ],
    [
      'a step missing',
      ({ bundle, steps }) => {
        const last = steps.at(-1);
        bundle.processSteps = bundle.processSteps.filter((step) => step !== last);
      },
    ],
    [
      'a step the diagram does not have',
      ({ bundle, steps }) => {
        bundle.processSteps.push({
          ...pick(steps),
          id: randomUUID(),
          name: 'One more',
          position: steps.length,
        });
      },
    ],
    [
      'two steps in the other order',
      ({ steps }) => {
        const [first, second] = steps;
        if (!first || !second) throw new Error('unreachable');
        [first.position, second.position] = [second.position, first.position];
      },
    ],
  ];

  it.for(breaks)('refuses %s', async ([, breakIt]) => {
    const given = withDiagram();

    breakIt(given);

    expect(await validateDiagrams(given.bundle)).toEqual([
      expect.objectContaining({
        table: 'businessProcesses',
        id: given.process.id,
        message: expect.stringMatching(notTheDiagram),
      }),
    ]);
  });

  it('leaves the steps of a process without a diagram alone', async () => {
    // Kestrel's processes have steps and no diagram: there is nothing to
    // hold them to, so any list of steps is taken as given.
    const bundle = structuredClone(parsedExample('kestrel.json'));
    const step = pick(bundle.processSteps);
    const process = pick(bundle.businessProcesses, (p) => p.id === step.processId);
    expect(process.bpmnXml ?? null).toBeNull();
    step.name = 'Anything at all';

    expect(await validateDiagrams(bundle)).toEqual([]);
  });

  it('takes a diagram saved in the app back in, steps and all', async ({ world }) => {
    const { enterprise, process } = await smallModel(world, await world.enterprise());
    const diagram = pick(parsedExample('alderbrook.json').businessProcesses, (p) =>
      Boolean(p.bpmnXml),
    ).bpmnXml;
    if (!diagram) throw new Error('unreachable');
    const saved = await world.processes.updateDiagram(enterprise.owner, process.id, diagram);
    expect(saved.steps.length).toBeGreaterThan(1);
    const endpoint = exchange(world);
    const exported = await endpoint.export(enterprise.owner);

    await endpoint.import(enterprise.owner, overTheWire(exported) as unknown as DataBundle);

    expect(withoutTimeOfExport(await endpoint.export(enterprise.owner))).toEqual(
      withoutTimeOfExport(exported),
    );
  });
});
