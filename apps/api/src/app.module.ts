import { join } from "node:path";
import { Module } from "@nestjs/common";
import { GraphQLModule } from "@nestjs/graphql";
import { MongooseModule } from "@nestjs/mongoose";
import { MercuriusDriver, MercuriusDriverConfig } from "@nestjs/mercurius";
import { AppService } from "./app.service";
import { ChallengeResolver } from "./challenge.resolver";
import { HealthResolver } from "./health.resolver";
import { ChallengeEntity, ChallengeSchema } from "./models/challenge.schema";

@Module({
  imports: [
    GraphQLModule.forRoot<MercuriusDriverConfig>({
      driver: MercuriusDriver,
      autoSchemaFile: join(process.cwd(), "apps/api/schema.gql"),
      path: "/graphql",
      graphiql: process.env.NODE_ENV !== "production"
    }),
    MongooseModule.forRoot(process.env.MONGODB_URI ?? "mongodb://localhost:27017/trendpot"),
    MongooseModule.forFeature([{ name: ChallengeEntity.name, schema: ChallengeSchema }])
  ],
  providers: [AppService, ChallengeResolver, HealthResolver]
})
export class AppModule {}
