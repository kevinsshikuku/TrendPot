import { getDefaultTikTokDisplayScopes, parseTikTokDisplayScopes } from "@trendpot/utils";

const resolvedScopes = parseTikTokDisplayScopes(
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_TIKTOK_DISPLAY_SCOPES ?? process.env.TIKTOK_DISPLAY_SCOPES
    : undefined
);

export function getConfiguredTikTokScopes(): string[] {
  return [...resolvedScopes];
}

export function getDefaultTikTokScopes(): string[] {
  return getDefaultTikTokDisplayScopes();
}
