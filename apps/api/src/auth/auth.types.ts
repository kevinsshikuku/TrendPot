import type { Session, User } from "@trendpot/types";

export interface AuthenticatedUser extends User {}

export interface AuthenticatedSession
  extends Pick<
    Session,
    | "id"
    | "userId"
    | "rolesSnapshot"
    | "issuedAt"
    | "expiresAt"
    | "refreshTokenHash"
    | "ipAddress"
    | "userAgent"
    | "status"
    | "metadata"
  > {}

export interface ResolvedAuthContext {
  user: AuthenticatedUser | null;
  session: AuthenticatedSession | null;
}
