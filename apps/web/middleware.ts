import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { userSchema, viewerSessionSchema, type User, type ViewerSession } from "@trendpot/types";
import { AUTH_SESSION_COOKIE_NAME, AUTH_USER_COOKIE_NAME } from "./src/lib/api-client";
import { resolveNextPath } from "./src/lib/navigation";

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function decodeCookie<T>(value: string | undefined, schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false } }): T | null {
  if (!value) {
    return null;
  }

  try {
    const json = decodeBase64Url(value);
    const parsed = schema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const ADMIN_ROLES = new Set(["operator", "admin"]);

function buildLoginRedirect(request: NextRequest) {
  const url = new URL("/login", request.url);
  const nextValue = resolveNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (nextValue) {
    url.searchParams.set("next", nextValue);
  }
  return url;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const userCookie = request.cookies.get(AUTH_USER_COOKIE_NAME)?.value;
  const sessionCookie = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value;

  const user = decodeCookie<User>(userCookie, userSchema);
  const session = decodeCookie<ViewerSession>(sessionCookie, viewerSessionSchema);
  const isAuthenticated = Boolean(user && session);

  const isAuthRoute = pathname === "/login" || pathname === "/signup" || pathname.startsWith("/auth/verify");

  if (isAuthenticated && isAuthRoute) {
    const nextParam = resolveNextPath(request.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(nextParam ?? "/account", request.url));
  }

  if (pathname.startsWith("/account")) {
    if (!isAuthenticated) {
      return NextResponse.redirect(buildLoginRedirect(request));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    if (!isAuthenticated) {
      return NextResponse.redirect(buildLoginRedirect(request));
    }

    const hasRole = user?.roles?.some((role) => ADMIN_ROLES.has(role)) ?? false;
    if (!hasRole) {
      const accountUrl = new URL("/account", request.url);
      accountUrl.searchParams.set("error", "forbidden");
      return NextResponse.redirect(accountUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt).*)"],
};
