import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/api-client";

const CALLBACK_PATH = "/auth/tiktok/callback";

type HeadersWithGetSetCookie = Headers & {
  getSetCookie?: () => string[];
};

function getSetCookies(source: Response) {
  const headers = source.headers as HeadersWithGetSetCookie;
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const header = source.headers.get("set-cookie");
  return header ? [header] : [];
}

function appendSetCookies(target: NextResponse, source: Response) {
  for (const cookie of getSetCookies(source)) {
    target.headers.append("set-cookie", cookie);
  }
}

function cloneHeaders(request: Request) {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (key.toLowerCase() === "host") {
      return;
    }
    headers.set(key, value);
  });
  headers.set("x-requested-with", "nextjs");
  return headers;
}

async function forward(request: Request) {
  const method = request.method.toUpperCase();
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(CALLBACK_PATH, apiBaseUrl);

  if (method === "GET") {
    targetUrl.search = incomingUrl.search;
  }

  const headers = cloneHeaders(request);
  const body = method === "GET" ? undefined : await request.text();

  const response = await fetch(targetUrl, {
    method,
    headers,
    body,
    redirect: "manual"
  });

  const location = response.headers.get("location");
  const setCookies = getSetCookies(response);

  if (location && response.status >= 300 && response.status < 400) {
    const redirectUrl = new URL(location, incomingUrl);
    const status = (response.status as 301 | 302 | 303 | 307 | 308) ?? 302;
    const nextResponse = NextResponse.redirect(redirectUrl, status);
    for (const cookie of setCookies) {
      nextResponse.headers.append("set-cookie", cookie);
    }
    return nextResponse;
  }

  const responseBody = await response.text();
  const headersToForward = new Headers();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie" || key.toLowerCase() === "location") {
      return;
    }
    headersToForward.set(key, value);
  });

  const nextResponse = new NextResponse(responseBody, {
    status: response.status,
    headers: headersToForward
  });

  appendSetCookies(nextResponse, response);
  return nextResponse;
}

export async function GET(request: Request) {
  try {
    return await forward(request);
  } catch (error) {
    console.error("Failed to proxy TikTok callback", error);
    return NextResponse.json({ error: "Unable to complete TikTok login." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    return await forward(request);
  } catch (error) {
    console.error("Failed to proxy TikTok callback", error);
    return NextResponse.json({ error: "Unable to complete TikTok login." }, { status: 502 });
  }
}
