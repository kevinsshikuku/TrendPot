import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import type { GraphQLResolveInfo } from "graphql";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { Logger } from "pino";
import { ALLOW_ANONYMOUS_KEY, ROLES_KEY } from "./auth/auth.decorators";
import { AuthAuditService } from "./auth/auth-audit.service";
import { RolesGuard } from "./auth/roles.guard";
import { RateLimitService } from "./auth/rate-limit.service";
import { PlatformAuthService } from "./platform-auth/platform-auth.service";
import { AuthEmailService } from "./platform-auth/email.service";

interface RecordedLog {
  level: string;
  args: unknown[];
}

const REQUIRED_ENV = {
  AUTH_OTP_HASH_SECRET: "test-otp-hash",
  AUTH_OTP_TOKEN_SECRET: "test-otp-token",
  AUTH_SESSION_TOKEN_SECRET: "test-session-token",
  AUTH_REFRESH_HASH_SECRET: "test-refresh-hash",
  AUTH_SESSION_COOKIE_NAME: "trendpot.sid",
  AUTH_REFRESH_COOKIE_NAME: "trendpot.refresh",
  AUTH_SESSION_TTL_HOURS: "24",
  AUTH_REFRESH_TTL_DAYS: "30"
} as const;

class InMemoryDocument<T extends Record<string, unknown>> {
  private readonly store: Map<string, InMemoryDocument<T>>;

  id: string;
  _id: { toString(): string };
  createdAt: Date;
  updatedAt: Date;

  constructor(store: Map<string, InMemoryDocument<T>>, payload: Partial<T> & { id?: string; _id?: string }) {
    this.store = store;
    this.id = String(payload.id ?? payload._id ?? randomUUID());
    const idReference = payload._id ?? this.id;
    this._id = {
      toString: () => String(idReference ?? this.id)
    };

    const now = new Date();
    this.createdAt = payload.createdAt instanceof Date ? payload.createdAt : now;
    this.updatedAt = payload.updatedAt instanceof Date ? payload.updatedAt : now;

    Object.assign(this, payload);
  }

  async save() {
    this.updatedAt = new Date();
    this.store.set(this.id, this);
    return this;
  }
}

function getValueByPath(source: Record<string, unknown>, path: string) {
  const segments = path.split(".");
  let current: unknown = source;

  for (const segment of segments) {
    if (current === undefined || current === null) {
      return undefined;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function setValueByPath(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = path.split(".");
  let cursor: Record<string, unknown> = target;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    if (typeof cursor[key] !== "object" || cursor[key] === null) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }

  cursor[segments[segments.length - 1]] = value as never;
}

function normalizeComparable(value: unknown) {
  if (value && typeof value === "object" && "toString" in value) {
    return String(value as { toString(): string });
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return value;
}

function matchesFilter<T extends Record<string, unknown>>(document: T, filter: Record<string, unknown>) {
  const entries = Object.entries(filter ?? {});
  return entries.every(([path, expected]) => {
    const actual = getValueByPath(document, path);
    return normalizeComparable(actual) === normalizeComparable(expected);
  });
}

function applyUpdate(document: Record<string, unknown>, update: Record<string, unknown>) {
  const operators = Object.entries(update);

  for (const [key, value] of operators) {
    if (key === "$set" && value && typeof value === "object") {
      for (const [path, fieldValue] of Object.entries(value)) {
        setValueByPath(document, path, fieldValue);
      }
      continue;
    }

    if (key === "$inc" && value && typeof value === "object") {
      for (const [path, amount] of Object.entries(value)) {
        const current = Number(getValueByPath(document, path) ?? 0);
        setValueByPath(document, path, current + Number(amount));
      }
      continue;
    }

    setValueByPath(document, key, value);
  }
}

class QueryExecutor<T> {
  private readonly executor: () => T | Promise<T>;

  constructor(executor: () => T | Promise<T>) {
    this.executor = executor;
  }

  exec() {
    return Promise.resolve(this.executor());
  }
}

class InMemoryModel<T extends Record<string, unknown> = Record<string, unknown>> {
  private readonly store = new Map<string, InMemoryDocument<T>>();

  async create(payload: Record<string, unknown>) {
    const document = new InMemoryDocument<T>(this.store, payload);
    this.store.set(document.id, document);
    return document as unknown as T;
  }

  findOne(filter: Record<string, unknown>) {
    return new QueryExecutor(async () => {
      for (const document of this.store.values()) {
        if (matchesFilter(document as unknown as Record<string, unknown>, filter)) {
          return document as unknown as T;
        }
      }
      return null;
    });
  }

  findById(id: string) {
    return new QueryExecutor(async () => (this.store.get(String(id)) as unknown as T | null) ?? null);
  }

  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>) {
    return new QueryExecutor(async () => {
      for (const document of this.store.values()) {
        if (matchesFilter(document as unknown as Record<string, unknown>, filter)) {
          applyUpdate(document as unknown as Record<string, unknown>, update);
          await document.save();
          return { matchedCount: 1, modifiedCount: 1 };
        }
      }
      return { matchedCount: 0, modifiedCount: 0 };
    });
  }

  find(filter: Record<string, unknown>) {
    let results = Array.from(this.store.values()).filter((document) =>
      matchesFilter(document as unknown as Record<string, unknown>, filter)
    );

    const chain = {
      sort: (sortDefinition: Record<string, number>) => {
        const [entry] = Object.entries(sortDefinition);
        if (entry) {
          const [path, direction] = entry;
          results = results.sort((a, b) => {
            const left = normalizeComparable(getValueByPath(a as never, path));
            const right = normalizeComparable(getValueByPath(b as never, path));
            if (left === right) {
              return 0;
            }
            const comparison = left > right ? 1 : -1;
            return direction < 0 ? -comparison : comparison;
          });
        }
        return chain;
      },
      limit: (limit: number) => {
        results = results.slice(0, limit);
        return chain;
      },
      exec: async () => results as unknown as T[]
    };

    return chain;
  }

  dump() {
    return Array.from(this.store.values());
  }
}

class RecordingEmailService extends AuthEmailService {
  lastPayload?: {
    email: string;
    otpCode: string;
    token: string;
  };

  override async sendOtpEmail(params: {
    email: string;
    otpCode: string;
    token: string;
    expiresAt: Date;
    logger: Logger;
    requestId?: string;
  }) {
    this.lastPayload = {
      email: params.email,
      otpCode: params.otpCode,
      token: params.token
    };
    await super.sendOtpEmail(params);
  }
}

class TestReply {
  readonly cookies: Array<{ name: string; value: string; options: Record<string, unknown> }>; 
  readonly cleared: Array<{ name: string; options: Record<string, unknown> }>; 
  readonly headers: Map<string, unknown>;

  constructor() {
    this.cookies = [];
    this.cleared = [];
    this.headers = new Map();
  }

  setCookie(name: string, value: string, options: Record<string, unknown>) {
    this.cookies.push({ name, value, options });
  }

  clearCookie(name: string, options: Record<string, unknown>) {
    this.cleared.push({ name, options });
    const index = this.cookies.findIndex((cookie) => cookie.name === name);
    if (index >= 0) {
      this.cookies.splice(index, 1);
    }
  }

  header(name: string, value: unknown) {
    this.headers.set(name.toLowerCase(), value);
  }
}

function createTestLogger(): { logger: Logger; events: RecordedLog[] } {
  const events: RecordedLog[] = [];
  const logger = {
    info: (...args: unknown[]) => {
      events.push({ level: "info", args });
    },
    warn: (...args: unknown[]) => {
      events.push({ level: "warn", args });
    },
    debug: (...args: unknown[]) => {
      events.push({ level: "debug", args });
    },
    error: (...args: unknown[]) => {
      events.push({ level: "error", args });
    }
  } as Logger;

  return { logger, events };
}

function withAuthEnvironment() {
  const previousEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(REQUIRED_ENV)) {
    previousEnv[key] = process.env[key];
    process.env[key] = value;
  }

  const userModel = new InMemoryModel();
  const authFactorModel = new InMemoryModel();
  const sessionModel = new InMemoryModel();
  const auditLogModel = new InMemoryModel();

  const emailService = new RecordingEmailService();
  const rateLimitService = new RateLimitService();
  const auditService = new AuthAuditService();

  const platformAuthService = new PlatformAuthService(
    userModel as never,
    authFactorModel as never,
    sessionModel as never,
    auditLogModel as never,
    emailService,
    rateLimitService,
    auditService
  );

  const dispose = () => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  return {
    service: platformAuthService,
    emailService,
    userModel,
    sessionModel,
    dispose
  };
}

class StubReflector {
  private readonly metadata: Map<symbol, unknown>;

  constructor(entries: Array<[symbol, unknown]>) {
    this.metadata = new Map(entries);
  }

  getAllAndOverride<T>(key: symbol, _targets: unknown[]): T | undefined {
    return this.metadata.get(key) as T | undefined;
  }
}

class TestExecutionContext {
  readonly __gql: { info: GraphQLResolveInfo; context: Record<string, unknown> };
  private readonly context: Record<string, unknown>;

  constructor(info: GraphQLResolveInfo, context: Record<string, unknown>) {
    this.__gql = { info, context };
    this.context = context;
  }

  getHandler() {
    return () => undefined;
  }

  getClass() {
    return class {};
  }

  getArgs() {
    return [];
  }

  getType() {
    return "graphql";
  }

  switchToHttp() {
    return {
      getRequest: () => this.context.request
    };
  }
}

test("passwordless login issues session cookies and persists refresh metadata", async (t) => {
  const environment = withAuthEnvironment();
  t.after(environment.dispose);

  const { logger } = createTestLogger();
  const reply = new TestReply();
  const email = "fan@example.com";

  const challenge = await environment.service.issueEmailOtp({
    email,
    displayName: "Fan Test",
    deviceLabel: "MacBook",
    logger,
    requestId: "req-auth-1",
    ipAddress: "203.0.113.5",
    userAgent: "node-test"
  });

  assert.ok(challenge.token.length > 0);
  assert.ok(environment.emailService.lastPayload);

  const otpCode = environment.emailService.lastPayload?.otpCode;
  assert.ok(otpCode, "OTP code should be captured by recording email service");

  const verification = await environment.service.verifyEmailOtp({
    email,
    otpCode,
    token: environment.emailService.lastPayload!.token,
    deviceLabel: "MacBook",
    logger,
    requestId: "req-auth-2",
    ipAddress: "203.0.113.5",
    userAgent: "node-test",
    reply
  });

  assert.equal(verification.user.email, email);
  assert.equal(verification.session.userId, verification.user.id);

  const sessionCookie = reply.cookies.find((cookie) => cookie.name === process.env.AUTH_SESSION_COOKIE_NAME);
  assert.ok(sessionCookie, "Session cookie should be set on reply");

  const refreshCookie = reply.cookies.find((cookie) => cookie.name === process.env.AUTH_REFRESH_COOKIE_NAME);
  assert.ok(refreshCookie, "Refresh cookie should be set on reply");

  const [persistedSession] = environment.sessionModel.dump();
  assert.ok(persistedSession, "Session document should be stored in memory");

  const expectedHash = createHash("sha256")
    .update(`${refreshCookie!.value}:${process.env.AUTH_REFRESH_HASH_SECRET}`)
    .digest("hex");

  assert.equal(
    (persistedSession as unknown as { refreshTokenHash: string }).refreshTokenHash,
    expectedHash,
    "Stored refresh hash should match hashed cookie value"
  );
});

test("roles guard rejects unauthenticated and unauthorized viewers", () => {
  const { logger, events } = createTestLogger();
  const reflector = new StubReflector([
    [ALLOW_ANONYMOUS_KEY, false],
    [ROLES_KEY, ["admin"]]
  ]);
  const audit = new AuthAuditService();
  const guard = new RolesGuard(reflector as never, audit);
  const reply = new TestReply();

  const info = { fieldName: "createChallenge" } as unknown as GraphQLResolveInfo;
  const contextBase = {
    requestId: "req-guard-1",
    logger,
    request: { ip: "198.51.100.8" },
    reply,
    user: null,
    session: null
  };

  const unauthenticatedContext = new TestExecutionContext(info, contextBase);
  assert.throws(() => guard.canActivate(unauthenticatedContext as never), UnauthorizedException);

  const forbiddenContext = new TestExecutionContext(info, {
    ...contextBase,
    user: { id: "user-1", roles: ["fan"] }
  });
  assert.throws(() => guard.canActivate(forbiddenContext as never), ForbiddenException);

  const allowedContext = new TestExecutionContext(info, {
    ...contextBase,
    user: { id: "user-2", roles: ["admin"] }
  });
  assert.equal(guard.canActivate(allowedContext as never), true);

  const reasons = events
    .filter((entry) => entry.level === "warn")
    .map((entry) => JSON.stringify(entry.args[0]));

  assert.ok(
    reasons.some((payload) => payload.includes("missing_session")),
    "Unauthorized attempt should be audited with missing_session reason"
  );
  assert.ok(
    reasons.some((payload) => payload.includes("insufficient_role")),
    "Forbidden attempt should be audited with insufficient_role reason"
  );
});
