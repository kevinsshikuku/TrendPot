import { NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE_NAME, AUTH_USER_COOKIE_NAME, GraphQLRequestError, apiClient } from "@/lib/api-client";
import { headersFromCookieHeader } from "@/lib/auth-headers";

const SECURE = process.env.NODE_ENV === "production";

function encodePayload(payload: unknown) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function appendBackendCookies(source: Response, target: NextResponse) {
  const headers = source.headers as Headers & { getSetCookie?: () => string[] };
  const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];

  for (const cookie of raw) {
    target.headers.append("set-cookie", cookie);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, otpCode, token, deviceLabel } = body ?? {};

    if (typeof email !== "string" || typeof otpCode !== "string" || typeof token !== "string") {
      return NextResponse.json({ error: "Email, OTP code, and token are required." }, { status: 400 });
    }

    const cookieHeader = request.headers.get("cookie") ?? "";

    const authHeaders = headersFromCookieHeader(cookieHeader);

    const result = await apiClient.verifyEmailOtp(
      { email, otpCode, token, deviceLabel },
      {
        includeResponse: true,
        init: {
          headers: {
            Cookie: cookieHeader,
            "x-requested-with": "nextjs",
            ...authHeaders
          }
        }
      }
    );

    const viewer = result.data;
    const response = NextResponse.json({ viewer });
    appendBackendCookies(result.response, response);

    const userPayload = viewer.user ? encodePayload(viewer.user) : "";
    const sessionPayload = viewer.session ? encodePayload({ ...viewer.session, metadata: viewer.session.metadata ?? {} }) : "";

    if (userPayload && viewer.session) {
      response.cookies.set({
        name: AUTH_USER_COOKIE_NAME,
        value: userPayload,
        httpOnly: false,
        sameSite: "lax",
        secure: SECURE,
        path: "/",
        expires: new Date(viewer.session.expiresAt)
      });
    } else {
      response.cookies.delete(AUTH_USER_COOKIE_NAME);
    }

    if (sessionPayload && viewer.session) {
      response.cookies.set({
        name: AUTH_SESSION_COOKIE_NAME,
        value: sessionPayload,
        httpOnly: false,
        sameSite: "lax",
        secure: SECURE,
        path: "/",
        expires: new Date(viewer.session.expiresAt)
      });
    } else {
      response.cookies.delete(AUTH_SESSION_COOKIE_NAME);
    }

    return response;
  } catch (error) {
    if (error instanceof GraphQLRequestError) {
      return NextResponse.json({ error: error.messages.join(" ") }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to verify OTP." }, { status: 500 });
  }
}
