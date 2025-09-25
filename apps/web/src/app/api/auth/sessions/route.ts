import { NextResponse } from "next/server";
import { GraphQLRequestError, apiClient } from "@/lib/api-client";
import { headersFromCookieHeader } from "@/lib/auth-headers";

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const authHeaders = headersFromCookieHeader(cookieHeader);

    const sessions = await apiClient.getViewerSessions({
      init: {
        headers: {
          Cookie: cookieHeader,
          "x-requested-with": "nextjs",
          ...authHeaders
        }
      }
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    if (error instanceof GraphQLRequestError) {
      return NextResponse.json({ error: error.messages.join(" ") }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to load sessions." }, { status: 500 });
  }
}
