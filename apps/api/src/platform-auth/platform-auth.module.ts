import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthAuditService } from "../auth/auth-audit.service";
import { RateLimitService } from "../auth/rate-limit.service";
import { AuthEmailService } from "./email.service";
import { PlatformAuthService } from "./platform-auth.service";
import { AuditLogEntity, AuditLogSchema } from "./schemas/audit-log.schema";
import { AuthFactorEntity, AuthFactorSchema } from "./schemas/auth-factor.schema";
import { SessionEntity, SessionSchema } from "./schemas/session.schema";
import { UserEntity, UserSchema } from "./schemas/user.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserEntity.name, schema: UserSchema },
      { name: AuthFactorEntity.name, schema: AuthFactorSchema },
      { name: SessionEntity.name, schema: SessionSchema },
      { name: AuditLogEntity.name, schema: AuditLogSchema }
    ])
  ],
  providers: [PlatformAuthService, AuthEmailService, RateLimitService, AuthAuditService],
  exports: [PlatformAuthService, MongooseModule, RateLimitService, AuthAuditService]
})
export class PlatformAuthModule {}
