import { NextResponse } from "next/server";
import { GraphQLRequestError, apiClient } from "@/lib/api-client";

export async function DELETE(request: Request, { params }: { params: { sessionId: string } }) {
  try {
    const { sessionId } = params;

    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return NextResponse.json({ error: "A session id is required." }, { status: 400 });
    }

    const cookieHeader = request.headers.get("cookie") ?? "";

    const session = await apiClient.revokeSession(sessionId, {
      init: {
        headers: {
          Cookie: cookieHeader,
          "x-requested-with": "nextjs"
        }
      }
    });

    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof GraphQLRequestError) {
      return NextResponse.json({ error: error.messages.join(" ") }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to revoke session." }, { status: 500 });
  }
}
