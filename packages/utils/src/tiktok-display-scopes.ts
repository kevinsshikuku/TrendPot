const DEFAULT_SCOPE_BUNDLE = [
  "user.info.basic",
  "video.list",
  "video.data",
  "webhook.subscription"
] as const;

export function getDefaultTikTokDisplayScopes(): string[] {
  return [...DEFAULT_SCOPE_BUNDLE];
}

export function parseTikTokDisplayScopes(raw?: string | null): string[] {
  if (!raw) {
    return getDefaultTikTokDisplayScopes();
  }

  const segments = raw
    .split(/[\s,]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return getDefaultTikTokDisplayScopes();
  }

  const unique: string[] = [];

  for (const scope of segments) {
    if (!unique.includes(scope)) {
      unique.push(scope);
    }
  }

  return unique;
}
