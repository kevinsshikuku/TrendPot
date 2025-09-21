import { Injectable } from "@nestjs/common";
import type { ChallengeSummary, ListChallengesParams } from "@trendpot/types";

const demoChallenges: ChallengeSummary[] = [
  {
    id: "sunset-sprint",
    title: "Sunset Sprint",
    tagline: "Capture golden hour transitions in 30 seconds",
    raised: 4200,
    currency: "KES",
    goal: 10000
  },
  {
    id: "duet-drive",
    title: "Duet Drive",
    tagline: "Weekly duet challenge uplifting Kenyan dancers",
    raised: 1850,
    currency: "KES",
    goal: 5000
  }
];

@Injectable()
export class AppService {
  getFeaturedChallenges(params: ListChallengesParams = {}): ChallengeSummary[] {
    const limit = sanitizeLimit(params.limit);

    if (typeof limit === "number") {
      return demoChallenges.slice(0, limit);
    }

    return demoChallenges;
  }
}

const sanitizeLimit = (limit: ListChallengesParams["limit"]): number | undefined => {
  if (typeof limit !== "number") {
    return undefined;
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    return undefined;
  }

  return Math.floor(limit);
};
