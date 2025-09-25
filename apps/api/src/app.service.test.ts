import assert from "node:assert/strict";
import test from "node:test";
import { AppService } from "./app.service";
import { ChallengeStatus } from "./models/challenge-status.enum";
import { ChallengeEntity } from "./models/challenge.schema";

type ChallengeDocumentLike = ChallengeEntity & {
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  __v: number;
};

class ChallengeModelStub {
  readonly documents = new Map<string, ChallengeDocumentLike>();
  readonly findCalls: Array<Record<string, unknown>> = [];
  readonly findOneCalls: Array<Record<string, unknown>> = [];
  readonly findOneAndUpdateCalls: Array<{ filter: Record<string, unknown>; update: Record<string, unknown> }> = [];
  createInputs: Array<Partial<ChallengeEntity>> = [];

  constructor(seed: ChallengeDocumentLike[] = []) {
    for (const document of seed) {
      this.documents.set(document.slug, structuredClone(document));
    }
  }

  find(filter: Record<string, unknown>) {
    this.findCalls.push(filter);
    return createQueryStub(() => Array.from(this.documents.values()).filter((doc) => matchesFilter(doc, filter)));
  }

  findOne(filter: Record<string, unknown>) {
    this.findOneCalls.push(filter);
    const match = Array.from(this.documents.values()).find((doc) => matchesFilter(doc, filter));
    return {
      async lean() {
        return match ? structuredClone(match) : null;
      }
    };
  }

  async create(input: Partial<ChallengeEntity>) {
    this.createInputs.push(input);
    const now = new Date("2024-02-01T00:00:00.000Z");
    const document: ChallengeDocumentLike = {
      slug: input.slug ?? "",
      title: input.title ?? "",
      tagline: input.tagline ?? "",
      description: input.description ?? "",
      goalCents: input.goalCents ?? 0,
      raisedCents: input.raisedCents ?? 0,
      currency: input.currency ?? "KES",
      status: input.status ?? ChallengeStatus.Draft,
      createdAt: now,
      updatedAt: now,
      __v: 0
    };

    this.documents.set(document.slug, structuredClone(document));

    return {
      toObject() {
        return structuredClone(document);
      }
    };
  }

  findOneAndUpdate(filter: Record<string, unknown>, update: Record<string, unknown>) {
    this.findOneAndUpdateCalls.push({ filter, update });
    const match = Array.from(this.documents.values()).find((doc) => matchesFilter(doc, filter));

    if (!match) {
      return {
        async exec() {
          return null;
        }
      };
    }

    const nextVersion = typeof update.$inc === "object" && typeof update.$inc.__v === "number" ? match.__v + update.$inc.__v : match.__v;

    const patched: ChallengeDocumentLike = {
      ...match,
      ...stripUpdateOperators(update),
      __v: nextVersion,
      updatedAt: update.updatedAt instanceof Date ? update.updatedAt : match.updatedAt
    };

    this.documents.set(patched.slug, structuredClone(patched));

    return {
      async exec() {
        return structuredClone(patched);
      }
    };
  }
}

const createQueryStub = (resolve: () => ChallengeDocumentLike[]) => {
  const state: { limit?: number; sort?: Record<string, number> } = {};

  const query = {
    sort(sort: Record<string, number>) {
      state.sort = sort;
      return query;
    },
    limit(value: number) {
      state.limit = value;
      return query;
    },
    lean() {
      return query;
    },
    async exec() {
      const raw = resolve();
      const sorted = applySort(raw, state.sort);
      const limited = typeof state.limit === "number" ? sorted.slice(0, state.limit) : sorted;
      return limited.map((doc) => structuredClone(doc));
    }
  };

  return query;
};

const applySort = (documents: ChallengeDocumentLike[], sort?: Record<string, number>) => {
  if (!sort) {
    return [...documents];
  }

  const entries = Object.entries(sort);

  return [...documents].sort((a, b) => {
    for (const [key, direction] of entries) {
      const lhs = (a as Record<string, unknown>)[key];
      const rhs = (b as Record<string, unknown>)[key];

      if (lhs instanceof Date && rhs instanceof Date) {
        if (lhs.getTime() === rhs.getTime()) {
          continue;
        }
        return direction >= 0 ? lhs.getTime() - rhs.getTime() : rhs.getTime() - lhs.getTime();
      }

      if (typeof lhs === "string" && typeof rhs === "string") {
        if (lhs === rhs) {
          continue;
        }
        return direction >= 0 ? lhs.localeCompare(rhs) : rhs.localeCompare(lhs);
      }
    }

    return 0;
  });
};

const matchesFilter = (document: ChallengeDocumentLike, filter: Record<string, unknown>): boolean => {
  const entries = Object.entries(filter ?? {});

  if (entries.length === 0) {
    return true;
  }

  for (const [key, value] of entries) {
    if (key === "$and" && Array.isArray(value)) {
      if (!value.every((child) => matchesFilter(document, child as Record<string, unknown>))) {
        return false;
      }
      continue;
    }

    if (key === "$or" && Array.isArray(value)) {
      if (!value.some((child) => matchesFilter(document, child as Record<string, unknown>))) {
        return false;
      }
      continue;
    }

    const current = (document as Record<string, unknown>)[key];

    if (value instanceof RegExp) {
      if (typeof current !== "string" || !value.test(current)) {
        return false;
      }
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const childEntries = Object.entries(value as Record<string, unknown>);

      for (const [childKey, childValue] of childEntries) {
        if (childKey === "$lt") {
          if (!isLessThan(current, childValue)) {
            return false;
          }
          continue;
        }

        if (!matchesFilter(document, { [childKey]: childValue })) {
          return false;
        }
      }

      continue;
    }

    if (current instanceof Date && value instanceof Date) {
      if (current.getTime() !== value.getTime()) {
        return false;
      }
      continue;
    }

    if (current !== value) {
      return false;
    }
  }

  return true;
};

const stripUpdateOperators = (update: Record<string, unknown>) => {
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(update)) {
    if (key.startsWith("$")) {
      continue;
    }
    clone[key] = value;
  }
  return clone;
};

const isLessThan = (current: unknown, comparator: unknown): boolean => {
  if (current instanceof Date && comparator instanceof Date) {
    return current.getTime() < comparator.getTime();
  }

  if (typeof current === "number" && typeof comparator === "number") {
    return current < comparator;
  }

  if (typeof current === "string" && typeof comparator === "string") {
    return current < comparator;
  }

  return false;
};

const createChallengeFixture = (overrides: Partial<ChallengeDocumentLike> = {}): ChallengeDocumentLike => ({
  slug: "sunset-sprint",
  title: "Sunset Sprint",
  tagline: "Chase the last light",
  description: "Creators sprint through sunset challenges.",
  goalCents: 50000,
  raisedCents: 12000,
  currency: "KES",
  status: ChallengeStatus.Live,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-02T00:00:00.000Z"),
  __v: 2,
  ...overrides
});

test("AppService.getFeaturedChallenges normalizes filter parameters", async () => {
  const modelStub = new ChallengeModelStub([createChallengeFixture()]);
  const service = new AppService(modelStub as never);
  const result = await service.getFeaturedChallenges({ status: "LIVE", limit: 3.9 });

  assert.deepEqual(modelStub.findCalls[0], { status: "live" });
  assert.equal(result[0]?.status, ChallengeStatus.Live);
});

test("AppService.paginateChallenges returns edges, analytics, and cursors", async () => {
  const docs = [
    createChallengeFixture({ slug: "a", title: "Alpha", createdAt: new Date("2024-01-03T00:00:00.000Z"), __v: 1 }),
    createChallengeFixture({ slug: "b", title: "Beta", createdAt: new Date("2024-01-02T00:00:00.000Z"), __v: 4, raisedCents: 50000 }),
    createChallengeFixture({ slug: "c", title: "Gamma", status: ChallengeStatus.Draft, createdAt: new Date("2024-01-01T00:00:00.000Z"), __v: 0 })
  ];
  const modelStub = new ChallengeModelStub(docs);
  const service = new AppService(modelStub as never);

  const firstPage = await service.paginateChallenges({ first: 2, filter: { status: "live" } });
  assert.equal(firstPage.edges.length, 2);
  assert.equal(firstPage.analytics.totalChallenges, 2);
  assert.equal(firstPage.analytics.statusBreakdown[ChallengeStatus.Live], 2);
  assert.ok(firstPage.pageInfo.hasNextPage);

  const nextPage = await service.paginateChallenges({ first: 2, after: firstPage.pageInfo.endCursor ?? undefined });
  assert.equal(nextPage.edges.length, 1);
  assert.equal(nextPage.edges[0]?.node.id, "b");
});

test("AppService.updateChallenge enforces optimistic locking and transitions", async () => {
  const modelStub = new ChallengeModelStub([createChallengeFixture({ slug: "sunset-sprint", status: ChallengeStatus.Draft, __v: 2 })]);
  const service = new AppService(modelStub as never);

  const updated = await service.updateChallenge({
    id: "sunset-sprint",
    expectedVersion: 2,
    title: "Sunset Momentum",
    status: ChallengeStatus.Live,
    goal: 75000
  });

  assert.equal(updated.title, "Sunset Momentum");
  assert.equal(updated.status, ChallengeStatus.Live);

  await assert.rejects(
    () =>
      service.updateChallenge({
        id: "sunset-sprint",
        expectedVersion: 2,
        status: ChallengeStatus.Draft
      }),
    { message: "Challenge has been modified since you last loaded it." }
  );
});

test("AppService.archiveChallenge sets archived status with version check", async () => {
  const modelStub = new ChallengeModelStub([createChallengeFixture({ slug: "sunset-sprint", status: ChallengeStatus.Live, __v: 1 })]);
  const service = new AppService(modelStub as never);

  const archived = await service.archiveChallenge({ id: "sunset-sprint", expectedVersion: 1 });
  assert.equal(archived.status, ChallengeStatus.Archived);

  await assert.rejects(
    () => service.archiveChallenge({ id: "sunset-sprint", expectedVersion: 1 }),
    { message: "Challenge has been modified since you last loaded it." }
  );
});

test("AppService.createChallenge rejects duplicates and persists valid payloads", async () => {
  const modelStub = new ChallengeModelStub();
  const service = new AppService(modelStub as never);

  const result = await service.createChallenge({
    id: "Sunset Sprint",
    title: " Sunset Sprint ",
    tagline: " Chase momentum ",
    description: " Harness the energy of golden hour. ",
    goal: 50000,
    currency: "kes",
    status: "LIVE"
  });

  assert.equal(modelStub.createInputs.length, 1);
  assert.equal(result.id, "sunset-sprint");

  await assert.rejects(
    () =>
      service.createChallenge({
        id: "sunset sprint",
        title: "Duplicate",
        tagline: "Duplicate",
        description: "Duplicate",
        goal: 100,
        currency: "KES",
        status: "draft"
      }),
    { message: "A challenge with this id already exists." }
  );
});
