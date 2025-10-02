import { join } from "node:path";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { GraphQLModule } from "@nestjs/graphql";
import { MongooseModule } from "@nestjs/mongoose";
import { MercuriusDriver, MercuriusDriverConfig } from "@nestjs/mercurius";
import { RateLimitGuard } from "./auth/rate-limit.guard";
import { RolesGuard } from "./auth/roles.guard";
import { ProfileCompletionGuard } from "./auth/profile.guard";
import { AppService } from "./app.service";
import { ChallengeResolver } from "./challenge.resolver";
import { HealthResolver } from "./health.resolver";
import { AuthResolver } from "./models/auth.resolver";
import { ChallengeEntity, ChallengeSchema } from "./models/challenge.schema";
import { SubmissionEntity, SubmissionSchema } from "./models/submission.schema";
import { TikTokAccountEntity, TikTokAccountSchema } from "./models/tiktok-account.schema";
import { VideoEntity, VideoSchema } from "./models/video.schema";
import { buildGraphQLContext } from "./observability/graphql-context";
import { structuredErrorFormatter } from "./observability/error-formatter";
import { PlatformAuthModule } from "./platform-auth/platform-auth.module";
import { PlatformAuthService } from "./platform-auth/platform-auth.service";
import { TikTokModule } from "./tiktok/tiktok.module";
import { DonationEntity, DonationSchema } from "./donations/donation.schema";
import { DonationsModule } from "./donations/donations.module";
import { MpesaWebhookController } from "./webhooks/mpesa.controller";
import { MpesaSignatureService } from "./webhooks/mpesa-signature.service";
import { MpesaCallbackQueue } from "./webhooks/mpesa-callback.queue";
import { WebhookEventEntity, WebhookEventSchema } from "./webhooks/webhook-event.schema";
import { AuditLogEntity, AuditLogSchema } from "./audit/audit-log.schema";
import { AuditLogService } from "./audit/audit-log.service";
import { RedisService } from "./redis/redis.service";
@Module({
  imports: [
    GraphQLModule.forRootAsync<MercuriusDriverConfig>({
      driver: MercuriusDriver,
      imports: [PlatformAuthModule],
      inject: [PlatformAuthService],
      useFactory: (authService: PlatformAuthService) => ({
        autoSchemaFile: join(process.cwd(), "apps/api/schema.gql"),
        path: "/graphql",
        graphiql: process.env.NODE_ENV !== "production",
        context: (request, reply) => buildGraphQLContext(request, reply, authService),
        errorFormatter: structuredErrorFormatter
      })
    }),
    MongooseModule.forRoot(process.env.MONGODB_URI ?? "mongodb://localhost:27017/trendpot"),
    MongooseModule.forFeature([
      { name: ChallengeEntity.name, schema: ChallengeSchema },
      { name: TikTokAccountEntity.name, schema: TikTokAccountSchema },
      { name: VideoEntity.name, schema: VideoSchema },
      { name: SubmissionEntity.name, schema: SubmissionSchema },
      { name: DonationEntity.name, schema: DonationSchema },
      { name: WebhookEventEntity.name, schema: WebhookEventSchema },
      { name: AuditLogEntity.name, schema: AuditLogSchema }
    ]),
    PlatformAuthModule,
    TikTokModule,
    DonationsModule
  ],
  controllers: [MpesaWebhookController],
  providers: [
    AppService,
    ChallengeResolver,
    HealthResolver,
    AuthResolver,
    MpesaSignatureService,
    MpesaCallbackQueue,
    AuditLogService,
    RedisService,
    {
      provide: APP_GUARD,
      useClass: ProfileCompletionGuard
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard
    }
  ]
})
export class AppModule {}
