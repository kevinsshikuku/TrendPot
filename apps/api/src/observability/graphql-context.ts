import type { FastifyReply, FastifyRequest } from "fastify";
import type { MercuriusContext } from "mercurius";
import type { Logger } from "pino";
import { createRequestLogger } from "./logger";

export interface GraphQLContext extends MercuriusContext {
  requestId: string;
  logger: Logger;
}

/**
 * Attaches a request ID and structured logger to the GraphQL context.
 * The reply header is also populated so clients can correlate errors
 * using the same identifier captured in logs.
 */
export const buildGraphQLContext = (
  request: FastifyRequest,
  reply: FastifyReply
): GraphQLContext => {
  const requestId = String(request.id);
  reply.header("x-request-id", requestId);

  return {
    app: reply.server,
    reply,
    request,
    requestId,
    logger: createRequestLogger(requestId)
  };
};
