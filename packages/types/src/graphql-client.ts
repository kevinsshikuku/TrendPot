import { z } from "zod";
import { challengeSummaryListSchema } from "./challenges";

export interface TrendPotGraphQLClientOptions {
  baseUrl: string;
  fetchImplementation?: typeof fetch;
  defaultHeaders?: HeadersInit;
}

export interface ListChallengesParams {
  status?: string;
  limit?: number;
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
    const variables = this.prepareFeaturedChallengesVariables(params);

    return this.executeGraphQL({
      query: FEATURED_CHALLENGES_QUERY,
      variables,
      parser: (payload) => featuredChallengesDataSchema.parse(payload).featuredChallenges
    });
  }

  private prepareFeaturedChallengesVariables(params: ListChallengesParams) {
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
