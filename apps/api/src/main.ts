import "reflect-metadata";
import { apiLogger } from "./observability/logger";
import { createApiApp } from "./bootstrap";

const bootstrap = async () => {
  const app = await createApiApp();

  const port = Number(process.env.PORT ?? 4000);

  await app.listen({ port, host: "0.0.0.0" });
  apiLogger.info(
    { event: "bootstrap.complete", port },
    "API running"
  );
};

void bootstrap();
