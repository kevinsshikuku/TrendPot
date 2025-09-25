import { NextResponse } from "next/server";
import { apiClient, GraphQLRequestError } from "@/lib/api-client";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      scopes?: string[];
      returnPath?: string;
      redirectUri?: string;
      deviceLabel?: string;
    };

    const intent = await apiClient.startTikTokLogin(body, {
      init: { headers: { "x-requested-with": "nextjs" } }
    });

    return NextResponse.json({ intent });
  } catch (error) {
    if (error instanceof GraphQLRequestError) {
      return NextResponse.json({ error: error.messages.join(" ") }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to initiate TikTok login." }, { status: 500 });
  }
}
