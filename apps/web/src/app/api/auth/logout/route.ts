import { NextResponse } from "next/server";
import { GraphQLRequestError, apiClient } from "@/lib/api-client";

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
    const { sessionId } = body ?? {};

    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return NextResponse.json({ error: "A session id is required." }, { status: 400 });
    }

    const cookieHeader = request.headers.get("cookie") ?? "";

    const result = await apiClient.logoutSession(sessionId, {
      includeResponse: true,
      init: {
        headers: {
          Cookie: cookieHeader,
          "x-requested-with": "nextjs"
        }
      }
    });

    const viewer = result.data;
    const response = NextResponse.json({ viewer });
    appendBackendCookies(result.response, response);

    response.cookies.delete("trendpot.session");
    response.cookies.delete("trendpot.user");

    return response;
  } catch (error) {
    if (error instanceof GraphQLRequestError) {
      return NextResponse.json({ error: error.messages.join(" ") }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to log out." }, { status: 500 });
  }
}
