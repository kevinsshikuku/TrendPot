import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GqlExecutionContext } from "@nestjs/graphql";
import type { GraphQLContext } from "../observability/graphql-context";
import { PROFILE_FIELDS_KEY, type ProfileFieldRequirement } from "./auth.decorators";

@Injectable()
export class ProfileCompletionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredFields = this.reflector.getAllAndOverride<ProfileFieldRequirement[]>(PROFILE_FIELDS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!requiredFields || requiredFields.length === 0) {
      return true;
    }

    const gqlContext = GqlExecutionContext.create(context);
    const ctx = gqlContext.getContext<GraphQLContext>();

    if (!ctx.user) {
      throw new UnauthorizedException("Authentication is required to access this resource.");
    }

    const missingFields: ProfileFieldRequirement[] = [];

    for (const field of requiredFields) {
      if (field === "displayName") {
        if (!ctx.user.displayName || ctx.user.displayName.trim().length === 0) {
          missingFields.push(field);
        }
        continue;
      }

      if (field === "phone") {
        if (!ctx.user.phone || String(ctx.user.phone).trim().length === 0) {
          missingFields.push(field);
        }
      }
    }

    if (missingFields.length > 0) {
      throw new BadRequestException({
        code: "PROFILE_INCOMPLETE",
        message: "Complete your profile to continue.",
        missingFields
      });
    }

    return true;
  }
}
