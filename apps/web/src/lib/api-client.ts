import { GraphQLRequestError, TrendPotGraphQLClient } from "@trendpot/types";

export const AUTH_USER_COOKIE_NAME = "trendpot.user";
export const AUTH_SESSION_COOKIE_NAME = "trendpot.session";

const fallbackBaseUrl = "http://localhost:4000";
const resolvedBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_BASE_URL ?? fallbackBaseUrl;

export const apiClient = new TrendPotGraphQLClient({ baseUrl: resolvedBaseUrl });
export { GraphQLRequestError };

export function buildAuthHeaders(params: { user?: string | null; session?: string | null }) {
  const headers: Record<string, string> = {};

  if (params.user && params.user.length > 0) {
    headers["x-trendpot-user"] = params.user;
  }

  if (params.session && params.session.length > 0) {
    headers["x-trendpot-session"] = params.session;
  }

  return headers;
}
