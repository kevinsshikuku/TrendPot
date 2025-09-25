import { NextResponse } from "next/server";
import { GraphQLRequestError, apiClient } from "@/lib/api-client";
import type { UpdateProfileInput } from "@/lib/auth-client";

export async function PATCH(request: Request) {
  let input: UpdateProfileInput = {};

  try {
    if (request.body) {
      input = (await request.json()) as UpdateProfileInput;
    }
  } catch {
    return NextResponse.json({ error: "Invalid profile payload." }, { status: 400 });
  }

  try {
    const cookieHeader = request.headers.get("cookie") ?? "";

    const user = await apiClient.updateViewerProfile(input ?? {}, {
      init: {
        headers: {
          Cookie: cookieHeader,
          "x-requested-with": "nextjs"
        }
      }
    });

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof GraphQLRequestError) {
      const primary = error.errors[0];
      const extensions = (primary?.extensions ?? {}) as Record<string, unknown>;
      const missingFields = Array.isArray(extensions.missingFields)
        ? (extensions.missingFields as string[])
        : undefined;
      const code = typeof extensions.code === "string" ? extensions.code : undefined;

      return NextResponse.json(
        {
          error: primary?.message ?? "Unable to update profile.",
          code,
          missingFields
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Unable to update profile." }, { status: 500 });
  }
}
