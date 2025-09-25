import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthAuditService } from "../auth/auth-audit.service";
import { RateLimitService } from "../auth/rate-limit.service";
import { RedisService } from "../redis/redis.service";
import { PlatformAuthService } from "./platform-auth.service";
import { PlatformAuthResolver } from "./auth.resolver";
import { TikTokAuthController } from "./tiktok.controller";
import { AuditLogEntity, AuditLogSchema } from "./schemas/audit-log.schema";
import { SessionEntity, SessionSchema } from "./schemas/session.schema";
import { UserEntity, UserSchema } from "./schemas/user.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserEntity.name, schema: UserSchema },
      { name: SessionEntity.name, schema: SessionSchema },
      { name: AuditLogEntity.name, schema: AuditLogSchema }
    ])
  ],
  controllers: [TikTokAuthController],
  providers: [PlatformAuthService, PlatformAuthResolver, RateLimitService, AuthAuditService, RedisService],
  exports: [PlatformAuthService, MongooseModule, RateLimitService, AuthAuditService, RedisService]
})
export class PlatformAuthModule {}
