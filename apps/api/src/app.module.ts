import { join } from "node:path";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { GraphQLModule } from "@nestjs/graphql";
import { MongooseModule } from "@nestjs/mongoose";
import { MercuriusDriver, MercuriusDriverConfig } from "@nestjs/mercurius";

import { RolesGuard } from "./auth/roles.guard";
import { AppService } from "./app.service";
import { ChallengeResolver } from "./challenge.resolver";
import { HealthResolver } from "./health.resolver";
import { AuthResolver } from "./models/auth.resolver";
import { ChallengeEntity, ChallengeSchema } from "./models/challenge.schema";
import { buildGraphQLContext } from "./observability/graphql-context";
import { structuredErrorFormatter } from "./observability/error-formatter";
import { PlatformAuthModule } from "./platform-auth/platform-auth.module";

@Module({
  imports: [
    GraphQLModule.forRoot<MercuriusDriverConfig>({
      driver: MercuriusDriver,
      autoSchemaFile: join(process.cwd(), "apps/api/schema.gql"),
      path: "/graphql",
      graphiql: process.env.NODE_ENV !== "production",
      context: (request, reply) => buildGraphQLContext(request, reply),
      errorFormatter: structuredErrorFormatter
    }),
    MongooseModule.forRoot(process.env.MONGODB_URI ?? "mongodb://localhost:27017/trendpot"),
    MongooseModule.forFeature([{ name: ChallengeEntity.name, schema: ChallengeSchema }]),
    PlatformAuthModule
  ],
  providers: [
    AppService,
    ChallengeResolver,
    HealthResolver,
    AuthResolver,
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
