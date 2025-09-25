const INTERNAL_PATH_REGEX = /^\/(?!\/)(?:[\w\-./?=&%#]*)$/;

/**
 * Normalises a `next` query parameter to a safe, relative path so we avoid
 * open redirects when bouncing unauthenticated viewers through the login flow.
 */
export function resolveNextPath(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(raw.trim());
    if (decoded === "" || decoded === "/") {
      return "/";
    }

    if (!INTERNAL_PATH_REGEX.test(decoded)) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

