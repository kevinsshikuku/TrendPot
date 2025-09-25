import { Float, ObjectType, Field, Query, Resolver } from "@nestjs/graphql";

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
  @Query(() => HealthPayload)
  health(): HealthPayload {
    return { status: "ok", service: "trendpot-api", uptime: process.uptime() };
  }
}
