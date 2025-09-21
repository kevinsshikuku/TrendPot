import { challengeSummaryListSchema } from "./challenges";

export interface TrendPotApiClientOptions {
  baseUrl: string;
  fetchImplementation?: typeof fetch;
  defaultHeaders?: HeadersInit;
}

export interface ListChallengesParams {
  status?: string;
  limit?: number;
}

export class TrendPotApiClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly defaultHeaders: HeadersInit;

  constructor(options: TrendPotApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.fetchFn = options.fetchImplementation ?? globalThis.fetch?.bind(globalThis);

    if (!this.fetchFn) {
      throw new Error("A fetch implementation must be provided when global fetch is unavailable.");
    }

    this.defaultHeaders = options.defaultHeaders ?? { Accept: "application/json" };
  }

  async getFeaturedChallenges(params: ListChallengesParams = {}) {
    const url = this.buildUrl("/v1/challenges", params);
    const response = await this.fetchFn(url.toString(), {
      headers: this.defaultHeaders,
      cache: "no-store"
    });

    if (!response.ok) {
      const body = await this.safeJson(response);
      const message = body && typeof body === "object" && "message" in body ? String(body.message) : response.statusText;
      throw new Error(`Failed to fetch challenges: ${message}`);
    }

    const payload = await response.json();
    return challengeSummaryListSchema.parse(payload);
  }

  private buildUrl(path: string, params: ListChallengesParams) {
    const url = new URL(path, `${this.baseUrl}/`);

    if (params.status) {
      url.searchParams.set("status", params.status);
    }

    if (typeof params.limit === "number" && Number.isFinite(params.limit) && params.limit > 0) {
      url.searchParams.set("limit", Math.floor(params.limit).toString());
    }

    return url;
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
        console.warn("Failed to parse error response JSON", error);
      }
      return null;
    }
  }
}
