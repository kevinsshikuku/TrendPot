import type { FastifyReply, FastifyRequest } from "fastify";
import type { MercuriusContext } from "mercurius";
import type { Logger } from "pino";
import { resolveAuthContext } from "../auth/auth-context";
import type { AuthenticatedSession, AuthenticatedUser } from "../auth/auth.types";
import { createRequestLogger } from "./logger";

export interface GraphQLContext extends MercuriusContext {
  requestId: string;
  logger: Logger;
  user: AuthenticatedUser | null;
  session: AuthenticatedSession | null;
}

/**
 * Attaches a request ID and structured logger to the GraphQL context.
 * The reply header is also populated so clients can correlate errors
 * using the same identifier captured in logs.
 */
export const buildGraphQLContext = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<GraphQLContext> => {
  const requestId = String(request.id);
  reply.header("x-request-id", requestId);
  const logger = createRequestLogger(requestId);
  const auth = resolveAuthContext(request, logger);

  return {
    app: reply.server,
    reply,
    request,
    requestId,
    logger,
    user: auth.user,
    session: auth.session
  };
};
