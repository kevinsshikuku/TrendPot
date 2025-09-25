import type { Viewer, ViewerSession } from "@trendpot/types";

interface ApiErrorPayload {
  error?: string;
}

async function handleJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = "Request failed.";
    try {
      const data = (await response.json()) as ApiErrorPayload;
      if (data?.error) {
        message = data.error;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export interface StartTikTokLoginInput {
  scopes?: string[];
  returnPath?: string;
  redirectUri?: string;
  deviceLabel?: string;
}

export async function startTikTokLogin(input?: StartTikTokLoginInput) {
  const response = await fetch("/api/auth/tiktok/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {})
  });

  return handleJsonResponse<{
    intent: {
      state: string;
      clientKey: string;
      redirectUri: string;
      scopes: string[];
      returnPath?: string | null;
    };
  }>(response);
}

export async function fetchViewer() {
  const response = await fetch("/api/auth/viewer", { method: "GET", cache: "no-store" });
  return handleJsonResponse<{ viewer: Viewer }>(response);
}

export async function fetchSessions() {
  const response = await fetch("/api/auth/sessions", { method: "GET", cache: "no-store" });
  return handleJsonResponse<{ sessions: ViewerSession[] }>(response);
}

export async function revokeSession(sessionId: string) {
  const response = await fetch(`/api/auth/sessions/${sessionId}`, {
    method: "DELETE",
    cache: "no-store"
  });

  return handleJsonResponse<{ session: ViewerSession }>(response);
}

export async function logout(sessionId: string) {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId })
  });

  return handleJsonResponse<{ viewer: Viewer }>(response);
}

export interface UpdateProfileInput {
  displayName?: string;
  phone?: string;
}

export async function updateProfile(input: UpdateProfileInput) {
  const response = await fetch("/api/auth/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {})
  });

  return handleJsonResponse<{ user: NonNullable<Viewer["user"]> }>(response);
}
