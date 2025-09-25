import { Float, ObjectType, Field, Query, Resolver } from "@nestjs/graphql";
import { AllowAnonymous } from "./auth/auth.decorators";

@ObjectType("Health")
class HealthPayload {
  @Field()
  declare status: string;

  @Field()
  declare service: string;

  @Field(() => Float)
  declare uptime: number;
}

@Resolver()
export class HealthResolver {
  @AllowAnonymous()
  @Query(() => HealthPayload)
  health(): HealthPayload {
    return { status: "ok", service: "trendpot-api", uptime: process.uptime() };
  }
}
