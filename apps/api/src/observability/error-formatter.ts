import { GraphQLError, type ExecutionResult } from "graphql";
import type { ErrorFormatter } from "mercurius";
import { GraphQLContext } from "./graphql-context";

/**
 * Ensures GraphQL errors include consistent metadata and a request ID.
 * This gives clients an "error envelope" aligned with our logging story
 * so issues can be traced across systems.
 */
export const structuredErrorFormatter: ErrorFormatter = (
  executionResult,
  context
) => {
  const graphContext = context as GraphQLContext;
  const requestId = graphContext.requestId ?? String(context.reply.request.id);
  const timestamp = new Date().toISOString();

  const response: ExecutionResult & {
    extensions: Record<string, unknown>;
  } = {
    data: executionResult.data,
    errors: executionResult.errors?.map(
      (error) =>
        new GraphQLError(error.message, {
          nodes: error.nodes,
          source: error.source,
          positions: error.positions,
          path: error.path,
          originalError: error.originalError,
          extensions: {
            ...error.extensions,
            code: error.extensions?.code ?? "INTERNAL_SERVER_ERROR",
            requestId,
            timestamp
          }
        })
    ),
    extensions: {
      ...(executionResult.extensions ?? {}),
      meta: {
        ...(executionResult.extensions as Record<string, unknown>)?.meta,
        requestId,
        timestamp
      }
    }
  };

  if (graphContext.logger && executionResult.errors?.length) {
    graphContext.logger.error(
      {
        requestId,
        errors: executionResult.errors.map((error) => ({
          message: error.message,
          path: error.path,
          code: error.extensions?.code ?? "INTERNAL_SERVER_ERROR"
        }))
      },
      "GraphQL execution failed"
    );
  }

  return {
    statusCode: 200,
    response
  };
};
