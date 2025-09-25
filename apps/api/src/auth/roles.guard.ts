import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GqlExecutionContext } from "@nestjs/graphql";
import type { GraphQLResolveInfo } from "graphql";
import type { GraphQLContext } from "../observability/graphql-context";
import { AuthAuditService } from "./auth-audit.service";
import { ALLOW_ANONYMOUS_KEY, ROLES_KEY } from "./auth.decorators";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly audit: AuthAuditService) {}

  canActivate(context: ExecutionContext): boolean {
    const allowAnonymous = this.reflector.getAllAndOverride<boolean>(ALLOW_ANONYMOUS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (allowAnonymous) {
      return true;
    }

    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo<GraphQLResolveInfo>();
    const ctx = gqlContext.getContext<GraphQLContext>();
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    const operationName = info.fieldName;

    if (!ctx.user) {
      this.audit.recordAuthorizationFailure({
        requestId: ctx.requestId,
        operation: operationName,
        reason: "missing_session",
        logger: ctx.logger,
        ipAddress: ctx.request.ip
      });
      throw new UnauthorizedException("Authentication is required to access this resource.");
    }

    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = ctx.user.roles.some((role) => requiredRoles.includes(role));
      if (!hasRole) {
        this.audit.recordAuthorizationFailure({
          requestId: ctx.requestId,
          operation: operationName,
          reason: "insufficient_role",
          logger: ctx.logger,
          userId: ctx.user.id,
          roles: ctx.user.roles,
          ipAddress: ctx.request.ip
        });
        throw new ForbiddenException("You do not have permission to perform this action.");
      }
    }

    return true;
  }
}
