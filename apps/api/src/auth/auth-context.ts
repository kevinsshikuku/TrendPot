import { Buffer } from "node:buffer";
import type { FastifyRequest } from "fastify";
import type { Logger } from "pino";
import { sessionSchema, userSchema } from "@trendpot/types";
import { z } from "zod";
import type { ResolvedAuthContext } from "./auth.types";

const base64PayloadSchema = z
  .string()
  .min(1)
  .transform((value) => {
    try {
      const decoded = Buffer.from(value, "base64url").toString("utf8");
      return JSON.parse(decoded) as unknown;
    } catch (error) {
      throw new Error("INVALID_BASE64_JSON");
    }
  });

const headersSchema = z.object({
  user: base64PayloadSchema.optional(),
  session: base64PayloadSchema.optional()
});

export const resolveAuthContext = (
  request: FastifyRequest,
  logger: Logger
): ResolvedAuthContext => {
  const headers = headersSchema.safeParse({
    user: typeof request.headers["x-trendpot-user"] === "string" ? request.headers["x-trendpot-user"] : undefined,
    session:
      typeof request.headers["x-trendpot-session"] === "string" ? request.headers["x-trendpot-session"] : undefined
  });

  let user: ResolvedAuthContext["user"] = null;
  let session: ResolvedAuthContext["session"] = null;

  if (!headers.success) {
    const reason = headers.error.issues[0]?.message ?? "invalid auth headers";
    logger.debug({ reason }, "Failed to parse auth headers");
    return { user, session };
  }

  if (headers.data.user) {
    try {
      user = userSchema.parse(headers.data.user);
    } catch (error) {
      logger.warn({ error }, "Rejected malformed user payload from auth header");
    }
  }

  if (headers.data.session) {
    try {
      const parsed = sessionSchema.parse(headers.data.session);
      session = {
        id: parsed.id,
        issuedAt: parsed.issuedAt,
        expiresAt: parsed.expiresAt,
        ipAddress: parsed.ipAddress,
        userAgent: parsed.userAgent,
        status: parsed.status
      };
    } catch (error) {
      logger.warn({ error }, "Rejected malformed session payload from auth header");
    }
  }

  return { user, session };
};
