import { cookies } from "next/headers";
import type { Viewer } from "@trendpot/types";
import { apiClient } from "./api-client";
import { headersFromCookieHeader } from "./auth-headers";

function buildCookieHeader(): string {
  const store = cookies();
  const entries = store.getAll();
  return entries.map(({ name, value }) => `${name}=${value}`).join("; ");
}

export async function loadViewerOnServer(): Promise<Viewer> {
  const cookieHeader = buildCookieHeader();
  const authHeaders = headersFromCookieHeader(cookieHeader);

  return apiClient.getViewer({
    init: {
      headers: {
        Cookie: cookieHeader,
        "x-requested-with": "nextjs",
        ...authHeaders
      }
    }
  });
}

export async function loadViewerSessionsOnServer() {
  const cookieHeader = buildCookieHeader();
  const authHeaders = headersFromCookieHeader(cookieHeader);

  return apiClient.getViewerSessions({
    init: {
      headers: {
        Cookie: cookieHeader,
        "x-requested-with": "nextjs",
        ...authHeaders
      }
    }
  });
}
