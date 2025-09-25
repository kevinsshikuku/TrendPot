import { Controller, Get, Query, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { resolveAuthContext } from "../auth/auth-context";
import { TikTokDisplayService } from "./tiktok.service";
import { PlatformAuthService } from "../platform-auth/platform-auth.service";

type VideoListQuery = {
  first?: string;
  after?: string;
};

@Controller("/tiktok")
export class TikTokController {
  constructor(
    private readonly tiktokService: TikTokDisplayService,
    private readonly platformAuthService: PlatformAuthService
  ) {}

  @Get("/display/videos")
  async listCreatorVideos(
    @Req() req: FastifyRequest<{ Querystring: VideoListQuery }>,
    @Res() reply: FastifyReply,
    @Query() query: VideoListQuery
  ) {
    const auth = await resolveAuthContext(req, req.log, this.platformAuthService);
    if (!auth.user) {
      throw new UnauthorizedException("Authentication required.");
    }

    const first = typeof query.first === "string" ? Number.parseInt(query.first, 10) : undefined;
    const after = typeof query.after === "string" && query.after.length > 0 ? query.after : undefined;

    const result = await this.tiktokService.listCreatorVideos({
      user: auth.user,
      first: Number.isFinite(first) ? first : undefined,
      after,
      logger: req.log,
      requestId: String(req.id)
    });

    reply.send(result);
    return reply;
  }
}

