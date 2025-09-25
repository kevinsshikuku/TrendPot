import { Field, ObjectType } from "@nestjs/graphql";
import type { AuthenticatedSession } from "../auth/auth.types";

@ObjectType("ViewerSession")
export class ViewerSessionModel {
  @Field()
  declare id: string;

  @Field(() => Date)
  declare issuedAt: Date;

  @Field(() => Date)
  declare expiresAt: Date;

  @Field({ nullable: true })
  declare ipAddress?: string | null;

  @Field({ nullable: true })
  declare userAgent?: string | null;

  @Field()
  declare status: string;

  static fromSession(session: AuthenticatedSession): ViewerSessionModel {
    const model = new ViewerSessionModel();
    model.id = session.id;
    model.issuedAt = new Date(session.issuedAt);
    model.expiresAt = new Date(session.expiresAt);
    model.ipAddress = session.ipAddress ?? null;
    model.userAgent = session.userAgent ?? null;
    model.status = session.status;
    return model;
  }
}
