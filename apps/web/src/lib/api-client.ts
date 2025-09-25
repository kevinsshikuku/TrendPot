import { GraphQLRequestError, TrendPotGraphQLClient } from "@trendpot/types";

const fallbackBaseUrl = "http://localhost:4000";
const resolvedBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_BASE_URL ?? fallbackBaseUrl;

export const apiBaseUrl = resolvedBaseUrl;
export const apiClient = new TrendPotGraphQLClient({ baseUrl: resolvedBaseUrl });
export { GraphQLRequestError };
