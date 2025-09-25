import { NextResponse } from "next/server";
import { AUTH_SESSION_COOKIE_NAME, AUTH_USER_COOKIE_NAME, GraphQLRequestError, apiClient } from "@/lib/api-client";
import { headersFromCookieHeader } from "@/lib/auth-headers";

const SECURE = process.env.NODE_ENV === "production";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId } = body ?? {};

    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return NextResponse.json({ error: "A session id is required." }, { status: 400 });
    }

    const cookieHeader = request.headers.get("cookie") ?? "";
    const authHeaders = headersFromCookieHeader(cookieHeader);

    const result = await apiClient.logoutSession(sessionId, {
      includeResponse: true,
      init: {
        headers: {
          Cookie: cookieHeader,
          "x-requested-with": "nextjs",
          ...authHeaders
        }
      }
    });

    const viewer = result.data;
    const response = NextResponse.json({ viewer });

    const headers = result.response.headers as Headers & { getSetCookie?: () => string[] };
    const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];

    for (const cookie of raw) {
      response.headers.append("set-cookie", cookie);
    }

    if (viewer.session) {
      response.cookies.set({
        name: AUTH_SESSION_COOKIE_NAME,
        value: Buffer.from(JSON.stringify(viewer.session)).toString("base64url"),
        httpOnly: false,
        sameSite: "lax",
        secure: SECURE,
        path: "/",
        expires: new Date(viewer.session.expiresAt)
      });
    } else {
      response.cookies.delete(AUTH_SESSION_COOKIE_NAME);
    }

    if (viewer.user && viewer.session) {
      response.cookies.set({
        name: AUTH_USER_COOKIE_NAME,
        value: Buffer.from(JSON.stringify(viewer.user)).toString("base64url"),
        httpOnly: false,
        sameSite: "lax",
        secure: SECURE,
        path: "/",
        expires: new Date(viewer.session.expiresAt)
      });
    } else {
      response.cookies.delete(AUTH_USER_COOKIE_NAME);
    }

    return response;
  } catch (error) {
    if (error instanceof GraphQLRequestError) {
      return NextResponse.json({ error: error.messages.join(" ") }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to log out." }, { status: 500 });
  }
}
