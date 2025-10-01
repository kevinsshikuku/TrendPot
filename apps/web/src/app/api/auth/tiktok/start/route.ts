import { NextResponse } from "next/server";
import { apiClient, GraphQLRequestError } from "@/lib/api-client";
import { getConfiguredTikTokScopes } from "@/lib/tiktok-scopes";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      scopes?: string[];
      returnPath?: string;
      redirectUri?: string;
      deviceLabel?: string;
    };

    const scopes = Array.isArray(body.scopes) && body.scopes.length > 0 ? [...body.scopes] : getConfiguredTikTokScopes();

    const intent = await apiClient.startTikTokLogin({ ...body, scopes }, {
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
