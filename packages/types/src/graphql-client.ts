import { z } from "zod";
import { challengeSchema, challengeSummaryListSchema } from "./challenges";
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

export interface CreateChallengeInput {
  id: string;
  title: string;
  tagline: string;
  description: string;
  goal: number;
  currency?: string;
  status?: string;
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
      description
      status
      createdAt
      updatedAt
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
      description
      status
      createdAt
      updatedAt
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
        const message = parsed.errors.map((error) => error.message).join(", ");
        throw new Error(`GraphQL responded with errors: ${message}`);
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
export { CHALLENGES_QUERY, CHALLENGE_QUERY, CREATE_CHALLENGE_MUTATION };
