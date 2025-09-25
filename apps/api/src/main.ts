import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import cors from "@fastify/cors";
import { apiLogger } from "./observability/logger";
import { PinoLoggerService } from "./observability/pino-logger.service";
import { AppModule } from "./app.module";

const bootstrap = async () => {
  const fastifyAdapter = new FastifyAdapter({
    logger: apiLogger,
    genReqId: (req) => (req.headers["x-request-id"] as string) ?? randomUUID(),
    disableRequestLogging: false,
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId"
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
    { bufferLogs: true }
  );

  app.useLogger(new PinoLoggerService(apiLogger));

  // Ensure every request surface (REST, GraphQL, etc.) echoes a request ID header
  // so clients can correlate structured log entries in downstream tooling.
  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onRequest", (request, reply, done) => {
      reply.header("x-request-id", String(request.id));
      done();
    });

  await app.register(cors, {
    origin: true,
    credentials: true
  });

  const port = Number(process.env.PORT ?? 4000);

  await app.listen({ port, host: "0.0.0.0" });
  apiLogger.info(
    { event: "bootstrap.complete", port },
    "API running"
  );
};

void bootstrap();
