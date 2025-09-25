import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthAuditService } from "../auth/auth-audit.service";
import { RateLimitService } from "../auth/rate-limit.service";
import { RedisService } from "../redis/redis.service";
import { TikTokTokenService } from "../security/tiktok-token.service";
import { TikTokIngestionQueue } from "../tiktok/tiktok-ingestion.queue";
import { PlatformAuthService } from "./platform-auth.service";
import { PlatformAuthResolver } from "./auth.resolver";
import { TikTokAuthController } from "./tiktok.controller";
import { AuditLogEntity, AuditLogSchema } from "./schemas/audit-log.schema";
import { SessionEntity, SessionSchema } from "./schemas/session.schema";
import { UserEntity, UserSchema } from "./schemas/user.schema";
import { TikTokAccountEntity, TikTokAccountSchema } from "../models/tiktok-account.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserEntity.name, schema: UserSchema },
      { name: SessionEntity.name, schema: SessionSchema },
      { name: AuditLogEntity.name, schema: AuditLogSchema },
      { name: TikTokAccountEntity.name, schema: TikTokAccountSchema }
    ])
  ],
  controllers: [TikTokAuthController],
  providers: [
    PlatformAuthService,
    PlatformAuthResolver,
    RateLimitService,
    AuthAuditService,
    RedisService,
    TikTokTokenService,
    TikTokIngestionQueue
  ],
  exports: [
    PlatformAuthService,
    MongooseModule,
    RateLimitService,
    AuthAuditService,
    RedisService,
    TikTokTokenService,
    TikTokIngestionQueue
  ]
})
export class PlatformAuthModule {}
