import { AUTH_SESSION_COOKIE_NAME, AUTH_USER_COOKIE_NAME, buildAuthHeaders } from "./api-client";

export function parseCookieHeader(cookieHeader: string | null | undefined) {
  const values: Record<string, string> = {};

  if (!cookieHeader || cookieHeader.length === 0) {
    return values;
  }

  const segments = cookieHeader.split(";");

  for (const segment of segments) {
    const [rawName, ...rest] = segment.split("=");
    if (!rawName || rest.length === 0) {
      continue;
    }
    const name = rawName.trim();
    const value = rest.join("=").trim();
    if (name) {
      values[name] = decodeURIComponent(value);
    }
  }

  return values;
}

export function headersFromCookieHeader(cookieHeader: string | null | undefined) {
  const values = parseCookieHeader(cookieHeader);
  return buildAuthHeaders({
    user: values[AUTH_USER_COOKIE_NAME],
    session: values[AUTH_SESSION_COOKIE_NAME]
  });
}
