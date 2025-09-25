import assert from "node:assert/strict";
import test from "node:test";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createApiApp } from "./bootstrap";

const prepareApplication = async (): Promise<NestFastifyApplication> => {
  const app = await createApiApp();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
};

test("allows configured origins and sets security headers", async (t) => {
  process.env.ALLOWED_ORIGINS = "https://app.trendpot.test, https://studio.trendpot.test";

  const app = await prepareApplication();
  t.after(async () => {
    delete process.env.ALLOWED_ORIGINS;
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/graphql",
    headers: {
      "content-type": "application/json",
      origin: "https://app.trendpot.test",
      "x-request-id": "security-test-request"
    },
    payload: {
      query: "{ health { status service uptime } }"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["access-control-allow-origin"], "https://app.trendpot.test");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.ok(
    response.headers["strict-transport-security"]?.includes("max-age=31536000"),
    "strict-transport-security header should advertise a 1 year max-age"
  );
  assert.equal(response.headers["x-request-id"], "security-test-request");

  const payload = response.json();
  assert.equal(payload.data.health.status, "ok");
  assert.equal(payload.data.health.service, "trendpot-api");
});

test("rejects disallowed origins with 403", async (t) => {
  process.env.ALLOWED_ORIGINS = "https://app.trendpot.test";

  const app = await prepareApplication();
  t.after(async () => {
    delete process.env.ALLOWED_ORIGINS;
    await app.close();
  });

  const response = await app.inject({
    method: "OPTIONS",
    url: "/graphql",
    headers: {
      origin: "https://malicious.example",
      "access-control-request-method": "POST"
    }
  });

  assert.equal(response.statusCode, 403);
  assert.match(response.body, /Origin not allowed/);
  assert.equal(response.headers["access-control-allow-origin"], undefined);
});
