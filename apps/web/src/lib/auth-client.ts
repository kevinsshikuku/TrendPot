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

export interface RequestOtpInput {
  email: string;
  displayName?: string;
  deviceLabel?: string;
}

export async function requestEmailOtp(input: RequestOtpInput) {
  const response = await fetch("/api/auth/request-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleJsonResponse<{ challenge: { token: string; expiresAt: string; deliveryHint: string } }>(response);
}

export interface VerifyOtpInput {
  email: string;
  otpCode: string;
  token: string;
  deviceLabel?: string;
}

export async function verifyEmailOtp(input: VerifyOtpInput) {
  const response = await fetch("/api/auth/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleJsonResponse<{ viewer: Viewer }>(response);
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
