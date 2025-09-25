import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "@trendpot/types";

export const ROLES_KEY = Symbol("roles");
export const ALLOW_ANONYMOUS_KEY = Symbol("allow_anonymous");
export const RATE_LIMIT_KEY = Symbol("rate_limit");

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const AllowAnonymous = () => SetMetadata(ALLOW_ANONYMOUS_KEY, true);

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

export const PROFILE_FIELDS_KEY = Symbol("profile_fields");

export type ProfileFieldRequirement = "displayName" | "phone";

export const RequireProfileFields = (...fields: ProfileFieldRequirement[]) =>
  SetMetadata(PROFILE_FIELDS_KEY, fields);
