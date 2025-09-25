import { Field, ObjectType } from "@nestjs/graphql";
import type { AuthenticatedSession } from "../auth/auth.types";
import type { Session } from "@trendpot/types";

@ObjectType("ViewerSessionMetadata")
export class ViewerSessionMetadataModel {
  @Field({ nullable: true })
  declare device?: string | null;

  @Field({ nullable: true })
  declare riskLevel?: string | null;

  @Field({ nullable: true })
  declare tiktokOpenId?: string | null;
}


@ObjectType("ViewerSession")
export class ViewerSessionModel {
  @Field()
  declare id: string;
  @Field()
  declare userId: string;

  @Field(() => [String])
  declare rolesSnapshot: string[];
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

  @Field({ nullable: true })
  declare deviceLabel?: string | null;

  @Field({ nullable: true })
  declare riskLevel?: string | null;

  @Field()
  declare refreshTokenHash: string;

  @Field(() => ViewerSessionMetadataModel, { nullable: true })
  declare metadata?: ViewerSessionMetadataModel | null;

  static fromSession(session: AuthenticatedSession | Session): ViewerSessionModel {
    const model = new ViewerSessionModel();
    model.id = session.id;
    model.userId = session.userId;
    model.rolesSnapshot = [...session.rolesSnapshot];
    model.issuedAt = new Date(session.issuedAt);
    model.expiresAt = new Date(session.expiresAt);
    model.ipAddress = session.ipAddress ?? null;
    model.userAgent = session.userAgent ?? null;
    model.status = session.status;
    model.deviceLabel = session.metadata?.device ?? null;
    model.riskLevel = session.metadata?.riskLevel ?? null;
    model.tiktokOpenId = (session.metadata as { tiktokOpenId?: string } | undefined)?.tiktokOpenId ?? null;
    model.refreshTokenHash = session.refreshTokenHash;
    if (session.metadata) {
      const metadata = new ViewerSessionMetadataModel();
      metadata.device = session.metadata.device ?? null;
      metadata.riskLevel = session.metadata.riskLevel ?? null;
      metadata.tiktokOpenId = (session.metadata as { tiktokOpenId?: string }).tiktokOpenId ?? null;
      model.metadata = metadata;
    } else {
      model.metadata = null;
    }
    return model;
  }
}
