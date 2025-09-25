import { randomUUID } from "node:crypto";
import type { FastifyCorsOptions } from "@fastify/cors";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { apiLogger } from "./observability/logger";
import { PinoLoggerService } from "./observability/pino-logger.service";

export type ErrorWithStatusCode = Error & { statusCode?: number };

type OriginCallback = (error: Error | null, allow?: boolean) => void;

type OriginEvaluator = (origin: string | undefined, callback: OriginCallback) => void;

const DEFAULT_REFERRER_POLICY = "strict-origin-when-cross-origin" as const;
const ONE_YEAR_IN_SECONDS = 31_536_000;

export const normalizeOrigin = (raw: string): string => {
  const trimmed = raw.trim();

  if (!trimmed) {
    return trimmed;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
};

export const resolveAllowedOrigins = (raw: string | undefined): ReadonlySet<string> => {
  const values = (raw ?? "")
    .split(",")
    .map((candidate) => normalizeOrigin(candidate))
    .filter((candidate) => candidate.length > 0);

  return new Set(values);
};

export const buildCorsEvaluator = (
  allowedOrigins: ReadonlySet<string>
): OriginEvaluator => {
  const callback: OriginEvaluator = (origin: string | undefined, done: OriginCallback) => {
    if (!origin) {
      done(null, true);
      return;
    }

    const normalized = normalizeOrigin(origin);

    if (allowedOrigins.has(normalized)) {
      done(null, true);
      return;
    }

    const error: ErrorWithStatusCode = new Error("Origin not allowed");
    error.statusCode = 403;

    apiLogger.warn({ event: "cors.blocked", origin: normalized }, error.message);

    done(error, false);
  };

  return callback;
};

export const createCorsOptions = (
  allowedOrigins = resolveAllowedOrigins(process.env.ALLOWED_ORIGINS)
): FastifyCorsOptions => ({
  origin: buildCorsEvaluator(allowedOrigins),
  credentials: true
});

export const createApiApp = async (): Promise<NestFastifyApplication> => {
  const fastifyAdapter = new FastifyAdapter({
    logger: apiLogger,
    genReqId: (request) => (request.headers["x-request-id"] as string) ?? randomUUID(),
    disableRequestLogging: false,
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId"
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter, {
    bufferLogs: true
  });

  app.useLogger(new PinoLoggerService(apiLogger));

  const fastify = app.getHttpAdapter().getInstance();

  fastify.addHook("onRequest", (request, reply, done) => {
    reply.header("x-request-id", String(request.id));
    done();
  });

  await app.register(helmet, {
    hsts: {
      maxAge: ONE_YEAR_IN_SECONDS,
      includeSubDomains: true,
      preload: true
    },
    frameguard: {
      action: "deny"
    },
    referrerPolicy: {
      policy: DEFAULT_REFERRER_POLICY
    },
    crossOriginEmbedderPolicy: false
  });

  const allowedOrigins = resolveAllowedOrigins(process.env.ALLOWED_ORIGINS);

  await app.register(cors, createCorsOptions(allowedOrigins));

  apiLogger.info(
    {
      event: "cors.allowlist",
      origins: Array.from(allowedOrigins)
    },
    "Configured CORS allowlist"
  );

  return app;
};
