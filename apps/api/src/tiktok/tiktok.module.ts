import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { PlatformAuthModule } from "../platform-auth/platform-auth.module";
import { UserEntity, UserSchema } from "../platform-auth/schemas/user.schema";
import { TikTokAccountEntity, TikTokAccountSchema } from "../models/tiktok-account.schema";
import { VideoEntity, VideoSchema } from "../models/video.schema";
import { SubmissionEntity, SubmissionSchema } from "../models/submission.schema";
import { ChallengeEntity, ChallengeSchema } from "../models/challenge.schema";
import { AuditLogEntity, AuditLogSchema } from "../platform-auth/schemas/audit-log.schema";
import { TikTokDisplayService } from "./tiktok.service";
import { TikTokResolver } from "./tiktok.resolver";
import { TikTokController } from "./tiktok.controller";

@Module({
  imports: [
    PlatformAuthModule,
    MongooseModule.forFeature([
      { name: UserEntity.name, schema: UserSchema },
      { name: TikTokAccountEntity.name, schema: TikTokAccountSchema },
      { name: VideoEntity.name, schema: VideoSchema },
      { name: SubmissionEntity.name, schema: SubmissionSchema },
      { name: ChallengeEntity.name, schema: ChallengeSchema },
      { name: AuditLogEntity.name, schema: AuditLogSchema }
    ])
  ],
  controllers: [TikTokController],
  providers: [TikTokDisplayService, TikTokResolver],
  exports: [TikTokDisplayService]
})
export class TikTokModule {}

