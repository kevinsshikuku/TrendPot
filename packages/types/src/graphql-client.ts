import { z } from "zod";
import {
  challengeListSchema,
  challengeSchema,
  challengeSummaryListSchema
} from "./challenges";
import type { ChallengeList } from "./challenges";
import type { Challenge } from "./challenges";

export interface TrendPotGraphQLClientOptions {
  baseUrl: string;
  fetchImplementation?: typeof fetch;
  defaultHeaders?: HeadersInit;
}

export interface ListChallengesParams {
  status?: string;
  limit?: number;
}

export interface ChallengeListFilters {
  status?: string;
  search?: string;
}

export interface ChallengeListRequest {
  first?: number;
  after?: string;
  filter?: ChallengeListFilters;
}

export interface CreateChallengeInput {
  id: string;
  title: string;
  tagline: string;
  description: string;
  goal: number;
  currency?: string;
  status?: string;
}

export interface UpdateChallengeInput {
  id: string;
  expectedVersion: number;
  title?: string;
  tagline?: string;
  description?: string;
  goal?: number;
  currency?: string;
  status?: string;
}

export interface ArchiveChallengeInput {
  id: string;
  expectedVersion: number;
}

export class GraphQLRequestError extends Error {
  constructor(readonly messages: string[]) {
    super(messages.join(" | "));
    this.name = "GraphQLRequestError";
  }
}

const graphQLResponseSchema = z.object({
  data: z.unknown().optional(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        path: z.array(z.union([z.string(), z.number()])).optional()
      })
    )
    .optional()
});

const featuredChallengesDataSchema = z.object({
  featuredChallenges: challengeSummaryListSchema
});

const FEATURED_CHALLENGES_QUERY = /* GraphQL */ `
  query FeaturedChallenges($status: String, $limit: Int) {
    featuredChallenges(status: $status, limit: $limit) {
      id
      title
      tagline
      raised
      goal
      currency
      status
      updatedAt
      version
    }
  }
`;

const challengesDataSchema = z.object({
  challenges: challengeSummaryListSchema
});

const CHALLENGES_QUERY = /* GraphQL */ `
  query Challenges($status: String, $limit: Int) {
    challenges(status: $status, limit: $limit) {
      id
      title
      tagline
      raised
      goal
      currency
      status
      updatedAt
      version
    }
  }
`;

const challengeDataSchema = z.object({
  challenge: challengeSchema.nullable()
});

const CHALLENGE_QUERY = /* GraphQL */ `
  query Challenge($id: String!) {
    challenge(id: $id) {
      id
      title
      tagline
      raised
      goal
      currency
      status
      updatedAt
      version
      description
      createdAt
    }
  }
`;

const createChallengeDataSchema = z.object({
  createChallenge: challengeSchema
});

const CREATE_CHALLENGE_MUTATION = /* GraphQL */ `
  mutation CreateChallenge($input: CreateChallengeInput!) {
    createChallenge(input: $input) {
      id
      title
      tagline
      raised
      goal
      currency
      status
      updatedAt
      version
      description
      createdAt
    }
  }
`;

const challengeAdminListDataSchema = z.object({
  challengeAdminList: challengeListSchema
});

const CHALLENGE_ADMIN_LIST_QUERY = /* GraphQL */ `
  query ChallengeAdminList($input: ChallengeListInput) {
    challengeAdminList(input: $input) {
      edges {
        cursor
        node {
          id
          title
          tagline
          raised
          goal
          currency
          status
          updatedAt
          version
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
      analytics {
        totalChallenges
        totalRaised
        totalGoal
        averageCompletion
        statusBreakdown {
          draft
          live
          archived
        }
      }
    }
  }
`;

const updateChallengeDataSchema = z.object({
  updateChallenge: challengeSchema
});

const UPDATE_CHALLENGE_MUTATION = /* GraphQL */ `
  mutation UpdateChallenge($input: UpdateChallengeInput!) {
    updateChallenge(input: $input) {
      id
      title
      tagline
      raised
      goal
      currency
      status
      updatedAt
      version
      description
      createdAt
    }
  }
`;

const archiveChallengeDataSchema = z.object({
  archiveChallenge: challengeSchema
});

const ARCHIVE_CHALLENGE_MUTATION = /* GraphQL */ `
  mutation ArchiveChallenge($input: ArchiveChallengeInput!) {
    archiveChallenge(input: $input) {
      id
      title
      tagline
      raised
      goal
      currency
      status
      updatedAt
      version
      description
      createdAt
    }
  }
`;

type GraphQLExecutor = <TResult>(options: {
  query: string;
  variables?: Record<string, unknown>;
  parser: (payload: unknown) => TResult;
}) => Promise<TResult>;

export class TrendPotGraphQLClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly defaultHeaders: HeadersInit;
  private readonly executeGraphQL: GraphQLExecutor;

  constructor(options: TrendPotGraphQLClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchFn = options.fetchImplementation ?? globalThis.fetch?.bind(globalThis);

    if (!this.fetchFn) {
      throw new Error("A fetch implementation must be provided when global fetch is unavailable.");
    }

    this.defaultHeaders = options.defaultHeaders ?? {
      Accept: "application/json",
      "Content-Type": "application/json"
    };

    this.executeGraphQL = this.createExecutor();
  }

  async getFeaturedChallenges(params: ListChallengesParams = {}) {
    const variables = this.prepareListVariables(params);

    return this.executeGraphQL({
      query: FEATURED_CHALLENGES_QUERY,
      variables,
      parser: (payload) => featuredChallengesDataSchema.parse(payload).featuredChallenges
    });
  }

  async listChallenges(params: ListChallengesParams = {}) {
    const variables = this.prepareListVariables(params);

    return this.executeGraphQL({
      query: CHALLENGES_QUERY,
      variables,
      parser: (payload) => challengesDataSchema.parse(payload).challenges
    });
  }

  async getChallengeAdminList(params: ChallengeListRequest = {}): Promise<ChallengeList> {
    const input = this.prepareChallengeListInput(params);

    return this.executeGraphQL({
      query: CHALLENGE_ADMIN_LIST_QUERY,
      variables: input ? { input } : undefined,
      parser: (payload) => challengeAdminListDataSchema.parse(payload).challengeAdminList
    });
  }

  async getChallenge(id: string): Promise<Challenge | null> {
    const normalized = id.trim();

    if (!normalized) {
      throw new Error("A challenge id is required.");
    }

    return this.executeGraphQL({
      query: CHALLENGE_QUERY,
      variables: { id: normalized },
      parser: (payload) => {
        const challenge = challengeDataSchema.parse(payload).challenge;
        if (!challenge) {
          return null;
        }
        return challenge;
      }
    });
  }

  async createChallenge(input: CreateChallengeInput) {
    return this.executeGraphQL({
      query: CREATE_CHALLENGE_MUTATION,
      variables: { input },
      parser: (payload) => createChallengeDataSchema.parse(payload).createChallenge
    });
  }

  async updateChallenge(input: UpdateChallengeInput) {
    return this.executeGraphQL({
      query: UPDATE_CHALLENGE_MUTATION,
      variables: { input },
      parser: (payload) => updateChallengeDataSchema.parse(payload).updateChallenge
    });
  }

  async archiveChallenge(input: ArchiveChallengeInput) {
    return this.executeGraphQL({
      query: ARCHIVE_CHALLENGE_MUTATION,
      variables: { input },
      parser: (payload) => archiveChallengeDataSchema.parse(payload).archiveChallenge
    });
  }

  private prepareListVariables(params: ListChallengesParams) {
    const variables: Record<string, unknown> = {};

    if (params.status && params.status.length > 0) {
      variables.status = params.status;
    }

    if (typeof params.limit === "number" && Number.isFinite(params.limit) && params.limit > 0) {
      variables.limit = Math.floor(params.limit);
    }

    return variables;
  }

  private prepareChallengeListInput(params: ChallengeListRequest) {
    const input: Record<string, unknown> = {};

    if (typeof params.first === "number" && Number.isFinite(params.first) && params.first > 0) {
      input.first = Math.floor(params.first);
    }

    if (params.after && params.after.length > 0) {
      input.after = params.after;
    }

    if (params.filter) {
      const filter: Record<string, unknown> = {};

      if (params.filter.status && params.filter.status.length > 0) {
        filter.status = params.filter.status;
      }

      if (params.filter.search && params.filter.search.trim().length > 0) {
        filter.search = params.filter.search.trim();
      }

      if (Object.keys(filter).length > 0) {
        input.filter = filter;
      }
    }

    return Object.keys(input).length > 0 ? input : undefined;
  }

  private createExecutor(): GraphQLExecutor {
    return async ({ query, variables, parser }) => {
      const response = await this.fetchFn(`${this.baseUrl}/graphql`, {
        method: "POST",
        headers: this.defaultHeaders,
        body: JSON.stringify({ query, variables }),
        cache: "no-store"
      });

      const json = await this.safeJson(response);

      if (!json) {
        throw new Error(`GraphQL request failed with status ${response.status}`);
      }

      const parsed = graphQLResponseSchema.parse(json);

      if (parsed.errors && parsed.errors.length > 0) {
        const messages = parsed.errors.map((error) => error.message);
        throw new GraphQLRequestError(messages);
      }

      if (!parsed.data) {
        throw new Error("GraphQL response did not include a data field.");
      }

      return parser(parsed.data);
    };
  }

  private async safeJson(response: Response): Promise<unknown | null> {
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return null;
    }

    try {
      return await response.json();
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Failed to parse GraphQL response JSON", error);
      }
      return null;
    }
  }
}

export { FEATURED_CHALLENGES_QUERY };
export {
  CHALLENGES_QUERY,
  CHALLENGE_QUERY,
  CREATE_CHALLENGE_MUTATION,
  CHALLENGE_ADMIN_LIST_QUERY,
  UPDATE_CHALLENGE_MUTATION,
  ARCHIVE_CHALLENGE_MUTATION
};
