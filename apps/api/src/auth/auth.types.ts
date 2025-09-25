import type { Session, User } from "@trendpot/types";

export interface AuthenticatedUser extends User {}

export interface AuthenticatedSession
  extends Pick<Session, "id" | "issuedAt" | "expiresAt" | "ipAddress" | "userAgent" | "status"> {}

export interface ResolvedAuthContext {
  user: AuthenticatedUser | null;
  session: AuthenticatedSession | null;
}
