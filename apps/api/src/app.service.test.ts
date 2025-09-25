import assert from "node:assert/strict";
import test from "node:test";
import type { ChallengeSummary } from "@trendpot/types";
import { AppService } from "./app.service";
import { ChallengeEntity } from "./models/challenge.schema";

type ChallengeDocumentLike = ChallengeEntity & { createdAt: Date; updatedAt: Date };

interface QueryState {
  limitArg?: number;
  sortArg?: Record<string, number>;
  execResult: ChallengeDocumentLike[];
}

// createQueryStub emulates the chainable query builder that Mongoose exposes so
// we can verify how the service configures find operations without a real
// database behind the scenes.
const createQueryStub = () => {
  const state: QueryState = {
    execResult: []
  };

  const query = {
    sort(sort: Record<string, number>) {
      state.sortArg = sort;
      return query;
    },
    lean() {
      return query;
    },
    limit(value: number) {
      state.limitArg = value;
      return query;
    },
    async exec() {
      return state.execResult;
    }
  };

  return { query, state };
};

// createChallengeModelStub wraps the query helper above and captures every call
// the service makes. This keeps the tests focused on behavior instead of
// runtime mocking libraries, which we do not have in this environment.
const createChallengeModelStub = () => {
  const { query, state } = createQueryStub();
  let findOneQueue: Array<{ lean: () => Promise<ChallengeDocumentLike | null> }> = [];

  const stub = {
    findCalls: [] as Array<Record<string, unknown>>,
    find(filter: Record<string, unknown>) {
      stub.findCalls.push(filter);
      return query;
    },
    findOneCalls: [] as Array<Record<string, unknown>>,
    findOne(filter: Record<string, unknown>) {
      stub.findOneCalls.push(filter);
      const next = findOneQueue.shift();
      if (!next) {
        return {
          async lean() {
            return null;
          }
        };
      }

      return next;
    },
    setFindOneResponses(responses: Array<ChallengeDocumentLike | null>) {
      findOneQueue = responses.map((value) => ({
        async lean() {
          return value;
        }
      }));
    },
    createInputs: [] as Array<Partial<ChallengeEntity>>,
    async create(input: Partial<ChallengeEntity>) {
      stub.createInputs.push(input);

      return {
        toObject() {
          return {
            ...input,
            createdAt: new Date("2024-02-01T00:00:00.000Z"),
            updatedAt: new Date("2024-02-01T00:00:00.000Z")
          } as ChallengeDocumentLike;
        }
      };
    },
    queryState: state
  };

  return stub;
};

// The fixture helper gives each test a predictable challenge document while
// still allowing targeted overrides for specific assertions.
const createChallengeFixture = (
  overrides: Partial<ChallengeDocumentLike> = {}
): ChallengeDocumentLike => ({
  slug: "sunset-sprint",
  title: "Sunset Sprint",
  tagline: "Chase the last light",
  description: "Creators sprint through sunset challenges.",
  goalCents: 50000,
  raisedCents: 12000,
  currency: "KES",
  status: "live",
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-02T00:00:00.000Z"),
  ...overrides
});

test("AppService.getFeaturedChallenges normalizes filter parameters", async () => {
  const modelStub = createChallengeModelStub();
  const challenge = createChallengeFixture();
  modelStub.queryState.execResult = [challenge];

  const service = new AppService(modelStub as never);
  const result = await service.getFeaturedChallenges({ status: "LIVE", limit: 3.9 });

  assert.deepEqual(modelStub.findCalls[0], { status: "live" });
  assert.equal(modelStub.queryState.limitArg, 3);

  const expected: ChallengeSummary[] = [
    {
      id: challenge.slug,
      title: challenge.title,
      tagline: challenge.tagline,
      raised: challenge.raisedCents,
      goal: challenge.goalCents,
      currency: challenge.currency
    }
  ];

  assert.deepEqual(result, expected);
});

test("AppService.getChallenge returns a normalized challenge when found", async () => {
  const modelStub = createChallengeModelStub();
  const challenge = createChallengeFixture({ slug: "sunset-sprint" });
  modelStub.setFindOneResponses([challenge]);

  const service = new AppService(modelStub as never);
  const result = await service.getChallenge("Sunset Sprint!!!");

  assert.deepEqual(modelStub.findOneCalls[0], { slug: "sunset-sprint" });
  assert.equal(result?.id, challenge.slug);
  assert.equal(result?.status, challenge.status);
  assert.equal(result?.createdAt, challenge.createdAt.toISOString());
});

test("AppService.createChallenge rejects duplicate slugs and persists valid payloads", async () => {
  const modelStub = createChallengeModelStub();
  modelStub.setFindOneResponses([null]);

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
  assert.deepEqual(modelStub.createInputs[0], {
    slug: "sunset-sprint",
    title: "Sunset Sprint",
    tagline: "Chase momentum",
    description: "Harness the energy of golden hour.",
    goalCents: 50000,
    raisedCents: 0,
    currency: "KES",
    status: "live"
  });

  assert.equal(result.id, "sunset-sprint");
  assert.equal(result.goal, 50000);
  assert.equal(result.currency, "KES");

  modelStub.setFindOneResponses([createChallengeFixture({ slug: "sunset-sprint" })]);

  await assert.rejects(
    () =>
      service.createChallenge({
        id: "sunset-sprint",
        title: "Duplicate",
        tagline: "Duplicate",
        description: "Duplicate",
        goal: 100,
        currency: "KES",
        status: "draft"
      }),
    {
      message: "A challenge with this id already exists."
    }
  );
});
