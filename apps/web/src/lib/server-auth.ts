import { cookies } from "next/headers";
import type { Viewer } from "@trendpot/types";
import { apiClient } from "./api-client";

function buildCookieHeader(): string {
  const store = cookies();
  const entries = store.getAll();
  return entries.map(({ name, value }) => `${name}=${value}`).join("; ");
}

export async function loadViewerOnServer(): Promise<Viewer> {
  const cookieHeader = buildCookieHeader();

  return apiClient.getViewer({
    init: {
      headers: {
        Cookie: cookieHeader,
        "x-requested-with": "nextjs"
      }
    }
  });
}

export async function loadViewerSessionsOnServer() {
  const cookieHeader = buildCookieHeader();

  return apiClient.getViewerSessions({
    init: {
      headers: {
        Cookie: cookieHeader,
        "x-requested-with": "nextjs"
      }
    }
  });
}
