import type { FastifyRequest } from "fastify";
import type { Logger } from "pino";
import type { ResolvedAuthContext } from "./auth.types";
import { PlatformAuthService } from "../platform-auth/platform-auth.service";

const SESSION_COOKIE_NAME = process.env.AUTH_SESSION_COOKIE_NAME ?? "trendpot.sid";
const REFRESH_COOKIE_NAME = process.env.AUTH_REFRESH_COOKIE_NAME ?? "trendpot.refresh";

const parseCookieHeader = (cookieHeader: string | undefined): Record<string, string> => {
  if (!cookieHeader || cookieHeader.length === 0) {
    return {};
  }

  const entries = cookieHeader.split(";");
  const values: Record<string, string> = {};

  for (const entry of entries) {
    const [rawName, ...rest] = entry.split("=");
    if (!rawName || rest.length === 0) {
      continue;
    }

    const name = rawName.trim();
    const value = rest.join("=").trim();

    if (name.length > 0) {
      values[name] = decodeURIComponent(value);
    }
  }

  return values;
};

export const resolveAuthContext = async (
  request: FastifyRequest,
  logger: Logger,
  authService: PlatformAuthService
): Promise<ResolvedAuthContext> => {
  const cookieHeader = typeof request.headers.cookie === "string" ? request.headers.cookie : "";
  const cookies = parseCookieHeader(cookieHeader);

  const sessionToken = cookies[SESSION_COOKIE_NAME];
  const refreshToken = cookies[REFRESH_COOKIE_NAME];

  if (!sessionToken || sessionToken.length === 0) {
    logger.debug({ event: "auth.context.session_cookie_missing" }, "No session cookie supplied");
    return { user: null, session: null };
  }

  try {
    const { user, session } = await authService.resolveSessionFromTokens({
      sessionToken,
      refreshToken,
      logger,
      requestId: String(request.id),
      ipAddress: request.ip,
      userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined
    });

    return { user, session };
  } catch (error) {
    logger.error({ error }, "Failed to resolve auth context from session cookie");
    return { user: null, session: null };
  }
};
