import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Viewer } from "@trendpot/types";
import { resolveNextPath } from "./src/lib/navigation";

const ADMIN_ROLES = new Set(["operator", "admin"]);
const SESSION_COOKIE_NAME = process.env.AUTH_SESSION_COOKIE_NAME ?? "trendpot.sid";

function buildLoginRedirect(request: NextRequest) {
  const url = new URL("/login", request.url);
  const nextValue = resolveNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (nextValue) {
    url.searchParams.set("next", nextValue);
  }
  return url;
}

async function loadViewer(request: NextRequest): Promise<Viewer | null> {
  const cookieHeader = request.headers.get("cookie") ?? "";

  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(new URL("/api/auth/viewer", request.url), {
      headers: {
        cookie: cookieHeader,
        "x-requested-with": "middleware"
      },
      cache: "no-store",
      credentials: "include"
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { viewer?: Viewer };
    return payload?.viewer ?? null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const isAuthRoute = pathname === "/login" || pathname === "/signup" || pathname.startsWith("/auth/verify");
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  let viewer: Viewer | null = null;
  let isAuthenticated = false;

  if (hasSessionCookie && (isAuthRoute || pathname.startsWith("/account") || pathname.startsWith("/admin"))) {
    viewer = await loadViewer(request);
    isAuthenticated = Boolean(viewer?.user && viewer?.session);
  } else {
    isAuthenticated = hasSessionCookie;
  }

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

    const hasRole = viewer?.user?.roles?.some((role) => ADMIN_ROLES.has(role)) ?? false;
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
