import { Controller, Get, Query } from "@nestjs/common";
import type { ListChallengesParams } from "@trendpot/types";
import { AppService } from "./app.service";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get("/health")
  getHealth() {
    return { status: "ok", uptime: process.uptime(), service: "trendpot-api" };
  }

  @Get("/v1/challenges")
  getChallenges(@Query("status") status?: string, @Query("limit") limit?: string) {
    const params: ListChallengesParams = {};

    if (typeof status === "string" && status.length > 0) {
      params.status = status;
    }

    if (typeof limit === "string") {
      const parsedLimit = Number.parseInt(limit, 10);
      if (!Number.isNaN(parsedLimit)) {
        params.limit = parsedLimit;
      }
    }

    return this.appService.getFeaturedChallenges(params);
  }
}
