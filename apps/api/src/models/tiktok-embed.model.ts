import { Field, ObjectType } from "@nestjs/graphql";

@ObjectType("TikTokEmbed")
export class TikTokEmbedModel {
  @Field()
  declare provider: string;

  @Field()
  declare html: string;

  @Field()
  declare scriptUrl: string;

  @Field({ nullable: true })
  declare width?: number;

  @Field({ nullable: true })
  declare height?: number;

  @Field({ nullable: true })
  declare thumbnailUrl?: string;

  @Field({ nullable: true })
  declare authorName?: string;

  @Field({ nullable: true })
  declare authorUrl?: string;
}
