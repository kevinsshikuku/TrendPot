import { Injectable } from "@nestjs/common";
import type { ChallengeSummary } from "@trendpot/types";

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
  getFeaturedChallenges(): ChallengeSummary[] {
    return demoChallenges;
  }
}
