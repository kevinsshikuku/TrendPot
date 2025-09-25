import { NextResponse } from "next/server";
import { apiClient, GraphQLRequestError } from "@/lib/api-client";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, displayName, deviceLabel } = body ?? {};

    if (typeof email !== "string" || email.trim().length === 0) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const challenge = await apiClient.requestEmailOtp(
      {
        email,
        displayName: typeof displayName === "string" ? displayName : undefined,
        deviceLabel: typeof deviceLabel === "string" ? deviceLabel : undefined
      },
      { init: { headers: { "x-requested-with": "nextjs" } } }
    );

    return NextResponse.json({ challenge });
  } catch (error) {
    if (error instanceof GraphQLRequestError) {
      return NextResponse.json({ error: error.messages.join(" ") }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to request OTP." }, { status: 500 });
  }
}
