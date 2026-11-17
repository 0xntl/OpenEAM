// Every column of the model, and where a person can use it.
//
// The rule this serves: a field that can be filled in but not used in some
// view is a defect. So every column of every model table is listed here, and
// for each surface it does not reach, the entry has to say why: a `gap` is a
// shortfall that is known and waiting to be fixed (or decided), an `exempt`
// is a decision that the field does not belong there. A column added to the
// schema without an entry fails `field-inventory.test.ts`, and so does an
// entry for a column that no longer exists.
//
// Surfaces, for the entity's own pages in the web app:
//   list    shown on its list page (or, for a link, on the list of the
//           entity it belongs to)
//   detail  shown on its detail page
//   filter  the list can be narrowed by it (search counts)
//   sort    the list can be ordered by it by the user
// Export and import are not listed: every column of a model table has to be
// in the bundle, and the test checks that against the bundle schema.
//
// What is claimed here about the web pages is not checked yet; that needs
// the browser tests in BACKLOG. Until then it is kept true by hand, and an
// entry is only as good as its last review.

type Reach = true | { gap: string } | { exempt: string };

export interface Field {
  list: Reach;
  detail: Reach;
  filter: Reach;
  sort: Reach;
}

// A column that is not a value a person fills in: a key, the enterprise a
// row belongs to, the side a link hangs off, an order. Its meaning reaches
// the pages through another entry, or not at all.
export interface Structural {
  structural: string;
}

export type Entry = Field | Structural;

export const yes = true as const;
export const gap = (why: string) => ({ gap: why });
export const exempt = (why: string) => ({ exempt: why });
const structural = (why: string): Structural => ({ structural: why });

// Reasons that recur, kept in one place so they read the same everywhere.
const NO_SORT = gap('no list can be sorted by the user');
const NO_FILTER = gap('this list has no filters');
const NO_PAGE = gap('has no page of its own; appears only as a name');
const KEY = structural('primary key');
const OWNER = structural('the enterprise the row belongs to (INV-16)');
const ORDER = structural('position within its parent');
const PRESENTATION = exempt('presentation, not a fact about the enterprise');

// createdAt and updatedAt are on every row and in every export, and shown
// nowhere. They are the obvious input for freshness ("when was this last
// confirmed"), which the trustworthy-core work asks for.
const RECORDED = gap('recorded and exported, shown nowhere');
const TIMESTAMPS = {
  createdAt: { list: RECORDED, detail: RECORDED, filter: RECORDED, sort: RECORDED },
  updatedAt: { list: RECORDED, detail: RECORDED, filter: RECORDED, sort: RECORDED },
} satisfies Record<string, Field>;

// The tables that are not the model: accounts, sessions and the instance.
// They are managed on the Administration page and are not in a bundle.
export const NOT_MODEL: Record<string, string> = {
  users: 'accounts',
  sessions: 'sign-in sessions',
  passwordSetupTokens: 'one-time setup links',
  instanceSettings: 'the instance’s settings',
  instanceAssets: 'the instance’s logo',
  enterpriseMembers: 'who may see an enterprise; kept across an import, not carried by it',
};

// Keyed by the table's export name in `@openeam/db`'s schema, which is also
// its key in a bundle.
export const FIELD_INVENTORY: Record<string, Record<string, Entry>> = {
  enterprises: {
    id: KEY,
    name: {
      list: yes,
      detail: yes,
      filter: exempt('one enterprise is open at a time; the switcher lists all of them'),
      sort: exempt('one enterprise is open at a time; the switcher lists all of them'),
    },
    description: {
      list: gap('shown nowhere but its own edit form'),
      detail: gap('shown nowhere but its own edit form'),
      filter: exempt('one enterprise is open at a time'),
      sort: exempt('one enterprise is open at a time'),
    },
    goal: {
      list: exempt('the switcher shows names'),
      detail: yes,
      filter: exempt('one enterprise is open at a time'),
      sort: exempt('one enterprise is open at a time'),
    },
    avatarBgColor: { list: yes, detail: PRESENTATION, filter: PRESENTATION, sort: PRESENTATION },
    avatarTextColor: { list: yes, detail: PRESENTATION, filter: PRESENTATION, sort: PRESENTATION },
    ...TIMESTAMPS,
  },

  architectureDomains: {
    id: KEY,
    enterpriseId: OWNER,
    name: { list: NO_PAGE, detail: NO_PAGE, filter: NO_PAGE, sort: NO_PAGE },
    description: { list: NO_PAGE, detail: NO_PAGE, filter: NO_PAGE, sort: NO_PAGE },
    isDefault: structural('marks the four seeded TOGAF domains'),
    ...TIMESTAMPS,
  },

  organizationUnits: {
    id: KEY,
    enterpriseId: OWNER,
    name: { list: NO_PAGE, detail: NO_PAGE, filter: NO_PAGE, sort: NO_PAGE },
    description: { list: NO_PAGE, detail: NO_PAGE, filter: NO_PAGE, sort: NO_PAGE },
    parentId: {
      list: NO_PAGE,
      detail: NO_PAGE,
      filter: gap('filtering by a unit does not include the units below it'),
      sort: NO_PAGE,
    },
    ...TIMESTAMPS,
  },

  buildingBlocks: {
    id: KEY,
    enterpriseId: OWNER,
    kind: { list: yes, detail: yes, filter: yes, sort: NO_SORT },
    name: { list: yes, detail: yes, filter: yes, sort: NO_SORT },
    description: {
      list: gap('searched, but not shown on the list'),
      detail: yes,
      filter: yes,
      sort: exempt('free text'),
    },
    icon: { list: yes, detail: yes, filter: PRESENTATION, sort: PRESENTATION },
    architectureLevel: {
      list: yes,
      detail: yes,
      filter: gap('on the landscape, not on the list'),
      sort: NO_SORT,
    },
    lifecyclePhase: { list: yes, detail: yes, filter: yes, sort: NO_SORT },
    validFrom: {
      list: yes,
      detail: yes,
      filter: gap('the list cannot filter by dates; only the landscape has "as of"'),
      sort: NO_SORT,
    },
    validTo: {
      list: yes,
      detail: yes,
      filter: gap('the list cannot filter by dates; only the landscape has "as of"'),
      sort: NO_SORT,
    },
    ...TIMESTAMPS,
  },

  // Classification, no history: a block is in one or more domains.
  buildingBlockArchitectureDomains: {
    buildingBlockId: structural('the block'),
    architectureDomainId: { list: yes, detail: yes, filter: yes, sort: NO_SORT },
  },

  buildingBlockOrganizationUnits: {
    id: KEY,
    buildingBlockId: structural('the block'),
    organizationUnitId: { list: yes, detail: yes, filter: yes, sort: NO_SORT },
    validFrom: {
      list: gap('not shown; every edit of the block rewrites the links without dates (BACKLOG)'),
      detail: gap('not shown; every edit of the block rewrites the links without dates (BACKLOG)'),
      filter: gap('only through the landscape’s "as of"'),
      sort: NO_SORT,
    },
    validTo: {
      list: gap('not shown; every edit of the block rewrites the links without dates (BACKLOG)'),
      detail: gap('not shown; every edit of the block rewrites the links without dates (BACKLOG)'),
      filter: gap('only through the landscape’s "as of"'),
      sort: NO_SORT,
    },
    ...TIMESTAMPS,
  },

  // Seen from the architecture building block: which solutions realize it.
  buildingBlockRealizations: {
    id: KEY,
    architectureBuildingBlockId: structural('the architecture building block'),
    solutionBuildingBlockId: {
      list: gap('only on the landscape ("Realized by"); no way to write one in the app'),
      detail: gap('on neither block’s page'),
      filter: gap('no filter by what realizes a block'),
      sort: NO_SORT,
    },
    validFrom: {
      list: gap('only on the landscape'),
      detail: gap('on neither block’s page'),
      filter: gap('only through the landscape’s "as of"'),
      sort: NO_SORT,
    },
    validTo: {
      list: gap('only on the landscape'),
      detail: gap('on neither block’s page'),
      filter: gap('only through the landscape’s "as of"'),
      sort: NO_SORT,
    },
    ...TIMESTAMPS,
  },

  // Seen from the block: which capabilities it supports. The capability's
  // page lists them as "resources".
  buildingBlockCapabilities: {
    id: KEY,
    buildingBlockId: structural('the block'),
    capabilityId: {
      list: gap('only on the capability’s page; no way to write one in the app (BACKLOG)'),
      detail: gap('only on the capability’s page'),
      filter: gap('no filter by capability'),
      sort: NO_SORT,
    },
    validFrom: {
      list: gap('the capability page ignores the dates'),
      detail: gap('the capability page ignores the dates'),
      filter: gap('the capability page ignores the dates'),
      sort: NO_SORT,
    },
    validTo: {
      list: gap('the capability page ignores the dates'),
      detail: gap('the capability page ignores the dates'),
      filter: gap('the capability page ignores the dates'),
      sort: NO_SORT,
    },
    ...TIMESTAMPS,
  },

  buildingBlockRelationships: {
    id: KEY,
    sourceBuildingBlockId: structural('the block the relationship starts from'),
    targetBuildingBlockId: {
      list: gap('not on the list; drawn on the landscape diagram'),
      detail: yes,
      filter: gap('no way to ask "everything hosted on X"'),
      sort: NO_SORT,
    },
    type: {
      list: gap('not on the list; drawn on the landscape diagram'),
      detail: yes,
      filter: gap('no filter by relationship type'),
      sort: NO_SORT,
    },
    description: {
      list: gap('not on the list'),
      detail: yes,
      filter: gap('not searched'),
      sort: exempt('free text'),
    },
    validFrom: {
      list: gap('not on the list'),
      detail: yes,
      filter: gap('only through the landscape diagram’s "as of"'),
      sort: NO_SORT,
    },
    validTo: {
      list: gap('not on the list'),
      detail: yes,
      filter: gap('only through the landscape diagram’s "as of"'),
      sort: NO_SORT,
    },
    ...TIMESTAMPS,
  },

  businessCapabilities: {
    id: KEY,
    enterpriseId: OWNER,
    name: { list: yes, detail: yes, filter: NO_FILTER, sort: NO_SORT },
    description: { list: yes, detail: yes, filter: NO_FILTER, sort: exempt('free text') },
    direction: { list: yes, detail: yes, filter: NO_FILTER, sort: NO_SORT },
    ...TIMESTAMPS,
  },

  businessProcesses: {
    id: KEY,
    enterpriseId: OWNER,
    capabilityId: {
      list: yes,
      detail: yes,
      filter: gap('the list is grouped by it, but cannot be narrowed to one'),
      sort: NO_SORT,
    },
    name: { list: yes, detail: yes, filter: NO_FILTER, sort: NO_SORT },
    description: {
      list: gap('fetched by the list, not shown'),
      detail: yes,
      filter: NO_FILTER,
      sort: exempt('free text'),
    },
    triggerEvent: {
      list: gap('fetched by the list, not shown'),
      detail: yes,
      filter: NO_FILTER,
      sort: exempt('free text'),
    },
    outcome: {
      list: gap('fetched by the list, not shown'),
      detail: yes,
      filter: NO_FILTER,
      sort: exempt('free text'),
    },
    bpmnXml: {
      list: yes,
      detail: yes,
      filter: gap('the list marks a process without a diagram, but cannot show only those'),
      sort: exempt('a diagram, not a value'),
    },
    ...TIMESTAMPS,
  },

  // Derived from the diagram (INV-7); see "Process steps and the diagram"
  // in BACKLOG.
  processSteps: {
    id: KEY,
    processId: structural('the process'),
    name: {
      list: gap('not on the process list'),
      detail: yes,
      filter: NO_FILTER,
      sort: exempt('kept in diagram order'),
    },
    position: ORDER,
    ...TIMESTAMPS,
  },

  valueStreams: {
    id: KEY,
    enterpriseId: OWNER,
    name: { list: yes, detail: yes, filter: NO_FILTER, sort: NO_SORT },
    description: { list: yes, detail: yes, filter: NO_FILTER, sort: exempt('free text') },
    ...TIMESTAMPS,
  },

  valueStreamStages: {
    id: KEY,
    valueStreamId: structural('the value stream'),
    name: {
      list: gap('the list counts stages, it does not name them'),
      detail: yes,
      filter: NO_FILTER,
      sort: exempt('kept in stream order'),
    },
    position: ORDER,
    ...TIMESTAMPS,
  },

  stageCapabilities: {
    stageId: structural('the stage'),
    capabilityId: {
      list: gap('the list counts capabilities, it does not name them'),
      detail: yes,
      filter: gap('no filter by capability'),
      sort: exempt('kept in stage order'),
    },
    position: ORDER,
  },

  informationObjects: {
    id: KEY,
    enterpriseId: OWNER,
    name: { list: yes, detail: yes, filter: NO_FILTER, sort: NO_SORT },
    description: { list: yes, detail: yes, filter: NO_FILTER, sort: exempt('free text') },
    ...TIMESTAMPS,
  },

  // Seen from the information object: which capabilities own, create or use
  // it. The capability's page lists the same links from its side.
  capabilityInformation: {
    id: KEY,
    informationObjectId: structural('the information object'),
    capabilityId: {
      list: yes,
      detail: yes,
      filter: gap('the list counts the objects nobody owns, but cannot show only those'),
      sort: NO_SORT,
    },
    usage: { list: yes, detail: yes, filter: NO_FILTER, sort: NO_SORT },
    validFrom: {
      list: gap('the list shows open links only, without dates'),
      detail: gap('shown on the information object, ignored on the capability'),
      filter: gap('no date filter outside the landscape'),
      sort: NO_SORT,
    },
    validTo: {
      list: gap('the list shows open links only, without dates'),
      detail: gap('shown on the information object, ignored on the capability'),
      filter: gap('no date filter outside the landscape'),
      sort: NO_SORT,
    },
    ...TIMESTAMPS,
  },

  actors: {
    id: KEY,
    enterpriseId: OWNER,
    kind: {
      list: yes,
      detail: yes,
      filter: gap('the list groups by kind, but cannot show one kind alone'),
      sort: NO_SORT,
    },
    name: { list: yes, detail: yes, filter: NO_FILTER, sort: NO_SORT },
    description: { list: yes, detail: yes, filter: NO_FILTER, sort: exempt('free text') },
    organizationUnitId: { list: yes, detail: yes, filter: NO_FILTER, sort: NO_SORT },
    ...TIMESTAMPS,
  },

  // Seen from the actor: which capabilities it is involved in.
  capabilityActors: {
    id: KEY,
    actorId: structural('the actor'),
    capabilityId: { list: yes, detail: yes, filter: NO_FILTER, sort: NO_SORT },
    involvement: { list: yes, detail: yes, filter: NO_FILTER, sort: NO_SORT },
    validFrom: {
      list: gap('the list shows open links only, without dates'),
      detail: gap('shown on the actor, ignored on the capability'),
      filter: gap('no date filter outside the landscape'),
      sort: NO_SORT,
    },
    validTo: {
      list: gap('the list shows open links only, without dates'),
      detail: gap('shown on the actor, ignored on the capability'),
      filter: gap('no date filter outside the landscape'),
      sort: NO_SORT,
    },
    ...TIMESTAMPS,
  },
};
