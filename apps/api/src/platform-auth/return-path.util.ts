const INTERNAL_RETURN_PATH_REGEX = /^\/(?!\/)(?:[\w\-./?=&%#]*)$/;

function decodeIfPossible(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Normalises a caller-provided return path so that TikTok login redirects only
 * ever resolve to TrendPot-controlled routes. Absolute URLs, protocol-relative
 * URLs, and other suspicious payloads are discarded.
 */
export function sanitizeReturnPath(raw: string | null | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const decoded = decodeIfPossible(trimmed);

  if (decoded === "/") {
    return "/";
  }

  if (!INTERNAL_RETURN_PATH_REGEX.test(decoded)) {
    return undefined;
  }

  return decoded;
}

