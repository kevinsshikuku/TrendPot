import { Field, ObjectType } from "@nestjs/graphql";
import type { AuthenticatedSession, AuthenticatedUser } from "../auth/auth.types";
import { ViewerSessionModel } from "./viewer-session.model";
import { ViewerUserModel } from "./viewer-user.model";

@ObjectType("Viewer")
export class ViewerModel {
  @Field(() => ViewerUserModel, { nullable: true })
  declare user: ViewerUserModel | null;

  @Field(() => ViewerSessionModel, { nullable: true })
  declare session: ViewerSessionModel | null;

  static fromContext(context: { user: AuthenticatedUser | null; session: AuthenticatedSession | null }) {
    const model = new ViewerModel();
    model.user = context.user ? ViewerUserModel.fromUser(context.user) : null;
    model.session = context.session ? ViewerSessionModel.fromSession(context.session) : null;
    return model;
  }
}
