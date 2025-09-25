import { z } from "zod";
import {
  challengeListSchema,
  challengeSchema,
  challengeSummaryListSchema
} from "./challenges";
import type { ChallengeList } from "./challenges";
import type { Challenge } from "./challenges";
import {
  emailOtpChallengeSchema,
  viewerSchema,
  viewerSessionSchema
} from "./auth";
import type { EmailOtpChallenge, Viewer, ViewerSession } from "./auth";

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

export interface GraphQLOperationOptions {
  init?: RequestInit;
  includeResponse?: boolean;
}

export interface GraphQLExecutionResult<TResult> {
  data: TResult;
  response: Response;
}

export interface RequestEmailOtpInput {
  email: string;
  displayName?: string;
  deviceLabel?: string;
}

export interface VerifyEmailOtpInput {
  email: string;
  otpCode: string;
  token: string;
  deviceLabel?: string;
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

const viewerDataSchema = z.object({
  viewer: viewerSchema
});

const VIEWER_QUERY = /* GraphQL */ `
  query Viewer {
    viewer {
      user {
        id
        email
        phone
        displayName
        roles
        permissions
        status
        createdAt
        updatedAt
      }
      session {
        id
        userId
        rolesSnapshot
        issuedAt
        expiresAt
        ipAddress
        userAgent
        status
        deviceLabel
        riskLevel
        refreshTokenHash
        metadata {
          device
          riskLevel
        }
      }
    }
  }
`;

const requestEmailOtpDataSchema = z.object({
  requestEmailOtp: emailOtpChallengeSchema
});

const REQUEST_EMAIL_OTP_MUTATION = /* GraphQL */ `
  mutation RequestEmailOtp($input: RequestEmailOtpInput!) {
    requestEmailOtp(input: $input) {
      token
      expiresAt
      deliveryHint
    }
  }
`;

const verifyEmailOtpDataSchema = z.object({
  verifyEmailOtp: viewerSchema
});

const VERIFY_EMAIL_OTP_MUTATION = /* GraphQL */ `
  mutation VerifyEmailOtp($input: VerifyEmailOtpInput!) {
    verifyEmailOtp(input: $input) {
      user {
        id
        email
        phone
        displayName
        roles
        permissions
        status
        createdAt
        updatedAt
      }
      session {
        id
        userId
        rolesSnapshot
        issuedAt
        expiresAt
        ipAddress
        userAgent
        status
        deviceLabel
        riskLevel
        refreshTokenHash
        metadata {
          device
          riskLevel
        }
      }
    }
  }
`;

const viewerSessionsDataSchema = z.object({
  viewerSessions: z.array(viewerSessionSchema)
});

const VIEWER_SESSIONS_QUERY = /* GraphQL */ `
  query ViewerSessions {
    viewerSessions {
      id
      userId
      rolesSnapshot
      issuedAt
      expiresAt
      ipAddress
      userAgent
      status
      deviceLabel
      riskLevel
      refreshTokenHash
      metadata {
        device
        riskLevel
      }
    }
  }
`;

const logoutSessionDataSchema = z.object({
  logoutSession: viewerSchema
});

const LOGOUT_SESSION_MUTATION = /* GraphQL */ `
  mutation LogoutSession($sessionId: String!) {
    logoutSession(sessionId: $sessionId) {
      user {
        id
        email
        phone
        displayName
        roles
        permissions
        status
        createdAt
        updatedAt
      }
      session {
        id
        userId
        rolesSnapshot
        issuedAt
        expiresAt
        ipAddress
        userAgent
        status
        deviceLabel
        riskLevel
        refreshTokenHash
        metadata {
          device
          riskLevel
        }
      }
    }
  }
`;

const revokeSessionDataSchema = z.object({
  revokeSession: viewerSessionSchema
});

const REVOKE_SESSION_MUTATION = /* GraphQL */ `
  mutation RevokeSession($sessionId: String!) {
    revokeSession(sessionId: $sessionId) {
      id
      userId
      rolesSnapshot
      issuedAt
      expiresAt
      ipAddress
      userAgent
      status
      deviceLabel
      riskLevel
      refreshTokenHash
      metadata {
        device
        riskLevel
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

export class TrendPotGraphQLClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly defaultHeaders: HeadersInit;

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
  }

  async getFeaturedChallenges(params: ListChallengesParams = {}) {
    const variables = this.prepareListVariables(params);

    const result = await this.performGraphQLRequest({
      query: FEATURED_CHALLENGES_QUERY,
      variables,
      parser: (payload) => featuredChallengesDataSchema.parse(payload).featuredChallenges
    });

    return result.data;
  }

  async listChallenges(params: ListChallengesParams = {}) {
    const variables = this.prepareListVariables(params);

    const result = await this.performGraphQLRequest({
      query: CHALLENGES_QUERY,
      variables,
      parser: (payload) => challengesDataSchema.parse(payload).challenges
    });

    return result.data;
  }

  async getChallengeAdminList(params: ChallengeListRequest = {}): Promise<ChallengeList> {
    const input = this.prepareChallengeListInput(params);

    const result = await this.performGraphQLRequest({
      query: CHALLENGE_ADMIN_LIST_QUERY,
      variables: input ? { input } : undefined,
      parser: (payload) => challengeAdminListDataSchema.parse(payload).challengeAdminList
    });

    return result.data;
  }

  async getChallenge(id: string): Promise<Challenge | null> {
    const normalized = id.trim();

    if (!normalized) {
      throw new Error("A challenge id is required.");
    }

    const result = await this.performGraphQLRequest({
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

    return result.data;
  }

  async createChallenge(input: CreateChallengeInput) {
    const result = await this.performGraphQLRequest({
      query: CREATE_CHALLENGE_MUTATION,
      variables: { input },
      parser: (payload) => createChallengeDataSchema.parse(payload).createChallenge
    });

    return result.data;
  }

  async updateChallenge(input: UpdateChallengeInput) {
    const result = await this.performGraphQLRequest({
      query: UPDATE_CHALLENGE_MUTATION,
      variables: { input },
      parser: (payload) => updateChallengeDataSchema.parse(payload).updateChallenge
    });

    return result.data;
  }

  async archiveChallenge(input: ArchiveChallengeInput) {
    const result = await this.performGraphQLRequest({
      query: ARCHIVE_CHALLENGE_MUTATION,
      variables: { input },
      parser: (payload) => archiveChallengeDataSchema.parse(payload).archiveChallenge
    });

    return result.data;
  }

  async getViewer(options: GraphQLOperationOptions = {}): Promise<Viewer> {
    const result = await this.performGraphQLRequest({
      query: VIEWER_QUERY,
      parser: (payload) => viewerDataSchema.parse(payload).viewer,
      init: options.init
    });

    return result.data;
  }

  async requestEmailOtp(
    input: RequestEmailOtpInput,
    options: GraphQLOperationOptions = {}
  ): Promise<EmailOtpChallenge> {
    const result = await this.performGraphQLRequest({
      query: REQUEST_EMAIL_OTP_MUTATION,
      variables: { input },
      parser: (payload) => requestEmailOtpDataSchema.parse(payload).requestEmailOtp,
      init: options.init
    });

    return result.data;
  }

  async verifyEmailOtp(
    input: VerifyEmailOtpInput,
    options: GraphQLOperationOptions & { includeResponse: true }
  ): Promise<GraphQLExecutionResult<Viewer>>;

  async verifyEmailOtp(
    input: VerifyEmailOtpInput,
    options?: GraphQLOperationOptions
  ): Promise<Viewer>;

  async verifyEmailOtp(input: VerifyEmailOtpInput, options: GraphQLOperationOptions = {}) {
    const result = await this.performGraphQLRequest({
      query: VERIFY_EMAIL_OTP_MUTATION,
      variables: { input },
      parser: (payload) => verifyEmailOtpDataSchema.parse(payload).verifyEmailOtp,
      init: options.init
    });

    if (options.includeResponse) {
      return result;
    }

    return result.data;
  }

  async getViewerSessions(options: GraphQLOperationOptions = {}): Promise<ViewerSession[]> {
    const result = await this.performGraphQLRequest({
      query: VIEWER_SESSIONS_QUERY,
      parser: (payload) => viewerSessionsDataSchema.parse(payload).viewerSessions,
      init: options.init
    });

    return result.data;
  }

  async logoutSession(
    sessionId: string,
    options: GraphQLOperationOptions & { includeResponse: true }
  ): Promise<GraphQLExecutionResult<Viewer>>;

  async logoutSession(sessionId: string, options?: GraphQLOperationOptions): Promise<Viewer>;

  async logoutSession(sessionId: string, options: GraphQLOperationOptions = {}) {
    const result = await this.performGraphQLRequest({
      query: LOGOUT_SESSION_MUTATION,
      variables: { sessionId },
      parser: (payload) => logoutSessionDataSchema.parse(payload).logoutSession,
      init: options.init
    });

    if (options.includeResponse) {
      return result;
    }

    return result.data;
  }

  async revokeSession(
    sessionId: string,
    options: GraphQLOperationOptions = {}
  ): Promise<ViewerSession> {
    const result = await this.performGraphQLRequest({
      query: REVOKE_SESSION_MUTATION,
      variables: { sessionId },
      parser: (payload) => revokeSessionDataSchema.parse(payload).revokeSession,
      init: options.init
    });

    return result.data;
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

  private async performGraphQLRequest<TResult>({
    query,
    variables,
    parser,
    init
  }: {
    query: string;
    variables?: Record<string, unknown>;
    parser: (payload: unknown) => TResult;
    init?: RequestInit;
  }): Promise<GraphQLExecutionResult<TResult>> {
    const headers: HeadersInit = {
      ...this.defaultHeaders,
      ...(init?.headers ?? {})
    };

    const payload: Record<string, unknown> = { query };

    if (variables && Object.keys(variables).length > 0) {
      payload.variables = variables;
    }

    const requestInit: RequestInit = {
      method: "POST",
      cache: "no-store",
      ...init,
      credentials: init?.credentials ?? "include",
      headers,
      body: JSON.stringify(payload)
    };

    const response = await this.fetchFn(`${this.baseUrl}/graphql`, requestInit);

    let parsedPayload: unknown;

    try {
      parsedPayload = await response.json();
    } catch (error) {
      throw new GraphQLRequestError([
        `Failed to parse GraphQL response: ${error instanceof Error ? error.message : String(error)}`
      ]);
    }

    const parsed = graphQLResponseSchema.parse(parsedPayload);

    if (parsed.errors && parsed.errors.length > 0) {
      const messages = parsed.errors.map((error) => error.message);
      throw new GraphQLRequestError(messages);
    }

    if (typeof parsed.data === "undefined") {
      throw new GraphQLRequestError(["GraphQL response did not include a data payload."]);
    }

    const data = parser(parsed.data);

    return { data, response };
  }
}

export { FEATURED_CHALLENGES_QUERY, VIEWER_QUERY };
export {
  CHALLENGES_QUERY,
  CHALLENGE_QUERY,
  CREATE_CHALLENGE_MUTATION,
  CHALLENGE_ADMIN_LIST_QUERY,
  UPDATE_CHALLENGE_MUTATION,
  ARCHIVE_CHALLENGE_MUTATION
};
