import { Context, Query, Resolver } from "@nestjs/graphql";
import { AllowAnonymous } from "../auth/auth.decorators";
import type { GraphQLContext } from "../observability/graphql-context";
import { ViewerModel } from "./viewer.model";

@Resolver(() => ViewerModel)
export class AuthResolver {
  @AllowAnonymous()
  @Query(() => ViewerModel, { name: "viewer" })
  viewer(@Context() context: GraphQLContext) {
    return ViewerModel.fromContext({ user: context.user, session: context.session });
  }
}
