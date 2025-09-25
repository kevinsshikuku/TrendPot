import { z } from "zod";

export const userRoleSchema = z.enum(["fan", "creator", "operator", "admin"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userPermissionSchema = z.enum([
  "view_public_profile",
  "initiate_donation",
  "manage_own_sessions",
  "update_own_profile",
  "manage_own_challenges",
  "view_own_donations",
  "manage_own_submissions",
  "manage_creator_profile",
  "view_all_donations",
  "view_audit_logs",
  "manage_sessions",
  "flag_content",
  "resolve_support_cases",
  "manage_all_challenges",
  "manage_roles",
  "manage_payouts",
  "manage_security_settings",
  "manage_rate_limits"
]);
export type UserPermission = z.infer<typeof userPermissionSchema>;

const fanPermissions = [
  "view_public_profile",
  "initiate_donation",
  "manage_own_sessions",
  "update_own_profile"
] as const satisfies ReadonlyArray<UserPermission>;

const creatorPermissions = [
  ...fanPermissions,
  "manage_own_challenges",
  "view_own_donations",
  "manage_own_submissions",
  "manage_creator_profile"
] as const satisfies ReadonlyArray<UserPermission>;

const operatorPermissions = [
  ...creatorPermissions,
  "view_all_donations",
  "view_audit_logs",
  "manage_sessions",
  "flag_content",
  "resolve_support_cases"
] as const satisfies ReadonlyArray<UserPermission>;

const adminPermissions = [
  ...operatorPermissions,
  "manage_all_challenges",
  "manage_roles",
  "manage_payouts",
  "manage_security_settings",
  "manage_rate_limits"
] as const satisfies ReadonlyArray<UserPermission>;

export const rolePermissions: Record<UserRole, ReadonlyArray<UserPermission>> = {
  fan: fanPermissions,
  creator: creatorPermissions,
  operator: operatorPermissions,
  admin: adminPermissions
};

export const userStatusSchema = z.enum(["active", "disabled", "pending_verification"]);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const userMetadataSchema = z
  .object({
    locale: z.string().optional(),
    timezone: z.string().optional(),
    notifications: z
      .object({
        email: z.boolean().optional(),
        sms: z.boolean().optional(),
        push: z.boolean().optional()
      })
      .optional(),
    featureFlags: z.record(z.string(), z.boolean()).optional()
  })
  .optional();

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  phone: z.string().optional(),
  roles: z.array(userRoleSchema).min(1),
  permissions: z.array(userPermissionSchema).min(1),
  displayName: z.string(),
  status: userStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: userMetadataSchema
});
export type User = z.infer<typeof userSchema>;

export const authFactorTypeSchema = z.enum(["email_otp", "magic_link"]);
export type AuthFactorType = z.infer<typeof authFactorTypeSchema>;

export const authFactorStatusSchema = z.enum(["active", "consumed", "expired", "revoked"]);
export type AuthFactorStatus = z.infer<typeof authFactorStatusSchema>;

export const authFactorSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: authFactorTypeSchema,
  channel: z.enum(["email", "phone"]),
  attempts: z.number().int().nonnegative().default(0),
  expiresAt: z.string(),
  createdAt: z.string(),
  status: authFactorStatusSchema
});
export type AuthFactor = z.infer<typeof authFactorSchema>;

export const sessionStatusSchema = z.enum(["active", "revoked", "expired"]);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const sessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  rolesSnapshot: z.array(userRoleSchema).min(1),
  issuedAt: z.string(),
  expiresAt: z.string(),
  refreshTokenHash: z.string(),
  ipAddress: z.string().ip({ version: "v4" }).or(z.string().ip({ version: "v6" })).optional(),
  userAgent: z.string().optional(),
  status: sessionStatusSchema,
  metadata: z
    .object({
      device: z.string().optional(),
      riskLevel: z.enum(["low", "medium", "high"]).optional()
    })
    .optional()
});
export type Session = z.infer<typeof sessionSchema>;

export const auditLogSeveritySchema = z.enum(["info", "warning", "critical"]);
export type AuditLogSeverity = z.infer<typeof auditLogSeveritySchema>;

export const auditLogActionSchema = z.enum([
  "auth.login",
  "auth.logout",
  "auth.factor.enroll",
  "auth.factor.challenge",
  "auth.factor.verify",
  "auth.session.issue",
  "auth.session.refresh",
  "auth.session.revoke",
  "security.settings.update",
  "security.rate_limit.update"
]);
export type AuditLogAction = z.infer<typeof auditLogActionSchema>;

export const auditLogEntrySchema = z.object({
  id: z.string(),
  actorId: z.string(),
  actorRoles: z.array(userRoleSchema),
  action: auditLogActionSchema,
  targetId: z.string().optional(),
  context: z
    .object({
      requestId: z.string().optional(),
      ipAddress: z.string().optional(),
      userAgent: z.string().optional(),
      summary: z.string().optional()
    })
    .optional(),
  severity: auditLogSeveritySchema,
  createdAt: z.string()
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const authBootstrapContractSchema = z.object({
  roles: z.array(userRoleSchema),
  permissions: z.array(userPermissionSchema),
  rolePermissions: z.record(userRoleSchema, z.array(userPermissionSchema))
});
export type AuthBootstrapContract = z.infer<typeof authBootstrapContractSchema>;

export const defaultAuthBootstrapContract: AuthBootstrapContract = {
  roles: userRoleSchema.options,
  permissions: userPermissionSchema.options,
  rolePermissions: {
    fan: [...fanPermissions],
    creator: [...creatorPermissions],
    operator: [...operatorPermissions],
    admin: [...adminPermissions]
  }
};

export const viewerSessionSchema = sessionSchema
  .pick({
    id: true,
    userId: true,
    rolesSnapshot: true,
    issuedAt: true,
    expiresAt: true,
    refreshTokenHash: true,
    ipAddress: true,
    userAgent: true,
    status: true,
    metadata: true
  })
  .extend({
    deviceLabel: z.string().optional().nullable(),
    riskLevel: z.string().optional().nullable(),
  });
export type ViewerSession = z.infer<typeof viewerSessionSchema>;

export const viewerSchema = z.object({
  user: userSchema.nullable(),
  session: viewerSessionSchema.nullable()
});
export type Viewer = z.infer<typeof viewerSchema>;

export const emailOtpChallengeSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  deliveryHint: z.string()
});
export type EmailOtpChallenge = z.infer<typeof emailOtpChallengeSchema>;

