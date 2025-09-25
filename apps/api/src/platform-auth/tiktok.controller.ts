import { BadRequestException, Controller, Get, Post, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { PlatformAuthService } from "./platform-auth.service";

interface TikTokCallbackPayload {
  code?: string;
  state?: string;
  deviceLabel?: string;
}

@Controller("/auth/tiktok")
export class TikTokAuthController {
  constructor(private readonly platformAuthService: PlatformAuthService) {}

  @Post("/callback")
  async handlePost(@Req() req: FastifyRequest<{ Body: TikTokCallbackPayload }>, @Res() reply: FastifyReply) {
    return this.processCallback(req, reply, req.body ?? {});
  }

  @Get("/callback")
  async handleGet(@Req() req: FastifyRequest<{ Querystring: TikTokCallbackPayload }>, @Res() reply: FastifyReply) {
    const query = (req.query as TikTokCallbackPayload | undefined) ?? {};
    return this.processCallback(req, reply, query);
  }

  private async processCallback(
    req: FastifyRequest,
    reply: FastifyReply,
    payload: TikTokCallbackPayload
  ) {
    const code = payload.code;
    const state = payload.state;
    const deviceLabel = payload.deviceLabel;

    if (!code || !state) {
      throw new BadRequestException("TikTok callback missing required parameters");
    }

    const result = await this.platformAuthService.completeTikTokLogin({
      code,
      state,
      deviceLabel,
      logger: req.log,
      requestId: String(req.id),
      ipAddress: req.ip,
      userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
      reply
    });

    const redirectTarget = result.redirectPath ?? "/";
    reply.redirect(redirectTarget);
    return reply;
  }
}
