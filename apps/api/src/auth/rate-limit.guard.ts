import { CanActivate, ExecutionContext, Injectable, TooManyRequestsException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GqlExecutionContext } from "@nestjs/graphql";
import type { GraphQLResolveInfo } from "graphql";
import type { GraphQLContext } from "../observability/graphql-context";
import { AuthAuditService } from "./auth-audit.service";
import { RATE_LIMIT_KEY, type RateLimitOptions } from "./auth.decorators";
import { RateLimitService } from "./rate-limit.service";

const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  windowMs: 60_000,
  max: 60
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
    private readonly audit: AuthAuditService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo<GraphQLResolveInfo>();
    const ctx = gqlContext.getContext<GraphQLContext>();

    const options =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? DEFAULT_RATE_LIMIT;

    const identifier = `${ctx.request.ip ?? "unknown"}:${info.fieldName}`;
    const { allowed, retryAt } = await this.rateLimitService.consume(identifier, options);

    if (!allowed) {
      this.audit.recordRateLimitViolation({
        requestId: ctx.requestId,
        operation: info.fieldName,
        reason: "rate_limited",
        logger: ctx.logger,
        userId: ctx.user?.id,
        roles: ctx.user?.roles,
        ipAddress: ctx.request.ip,
        retryAt
      });
      ctx.reply.header("Retry-After", Math.ceil((retryAt - Date.now()) / 1000));
      throw new TooManyRequestsException("Too many requests. Please try again later.");
    }

    return true;
  }
}
