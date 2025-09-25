declare module "node:test" {
  type TestFn = (t: unknown) => void | Promise<void>;
  function test(name: string, fn: TestFn): Promise<void>;
  function test(fn: TestFn): Promise<void>;
  export = test;
}

declare module "node:assert/strict" {
  interface Assert {
    (value: unknown, message?: string): void;
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
    rejects(block: () => Promise<unknown>, expected?: unknown): Promise<void>;
  }
  const assert: Assert;
  export = assert;
}

declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
}

declare const process: { env: NodeJS.ProcessEnv; uptime(): number; cwd(): string };

declare module "node:path" {
  export function join(...parts: string[]): string;
}

declare module "@nestjs/common" {
  export const Module: (...args: unknown[]) => ClassDecorator;
  export const Injectable: (...args: unknown[]) => ClassDecorator;
  export class BadRequestException extends Error {}
  export class Logger {
    log(...args: unknown[]): void;
    error(...args: unknown[]): void;
  }
}

declare module "@nestjs/core" {
  export const NestFactory: {
    create: (...args: unknown[]) => Promise<unknown>;
  };
}

declare module "@nestjs/graphql" {
  export const Resolver: (...args: unknown[]) => ClassDecorator;
  export const Query: (...args: unknown[]) => MethodDecorator;
  export const Mutation: (...args: unknown[]) => MethodDecorator;
  export const Args: (...args: unknown[]) => ParameterDecorator;
  export const ObjectType: (...args: unknown[]) => ClassDecorator;
  export const Field: (...args: unknown[]) => PropertyDecorator;
  export const InputType: (...args: unknown[]) => ClassDecorator;
  export const Int: unknown;
  export const Float: unknown;
  export const GraphQLISODateTime: unknown;
}

declare module "@nestjs/mongoose" {
  export const InjectModel: (...args: unknown[]) => ParameterDecorator;
  export const MongooseModule: { forRoot: (...args: unknown[]) => unknown; forFeature: (...args: unknown[]) => unknown };
  export const Schema: (...args: unknown[]) => ClassDecorator;
  export const Prop: (...args: unknown[]) => PropertyDecorator;
  export const SchemaFactory: { createForClass: (...args: unknown[]) => unknown };
}

declare module "@nestjs/mercurius" {
  export const MercuriusDriver: unknown;
  export interface MercuriusDriverConfig {}
}

declare module "@nestjs/platform-fastify" {
  export class FastifyAdapter {}
  export type NestFastifyApplication = unknown;
}

declare module "@fastify/cors" {
  const cors: (...args: unknown[]) => unknown;
  export default cors;
}

declare module "mongoose" {
  export type Model<T> = {
    find: (...args: unknown[]) => unknown;
    findOne: (...args: unknown[]) => unknown;
    create: (...args: unknown[]) => Promise<{ toObject(): T }>;
  };
  export type HydratedDocument<T> = T;
}

declare module "@trendpot/types" {
  export interface ChallengeSummary {
    id: string;
    title: string;
    tagline: string;
    raised: number;
    goal: number;
    currency: string;
  }
  export interface Challenge extends ChallengeSummary {
    description: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }
  export interface ListChallengesParams {
    status?: string;
    limit?: number;
  }
  export type CreateChallengeInput = unknown;
  export const challengeLeaderboardSchema: {
    parse<T>(input: T): T;
  };
  export class TrendPotGraphQLClient {
    constructor(...args: unknown[]);
  }
}
