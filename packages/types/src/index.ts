import { z } from "zod";

export const challengeSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  tagline: z.string(),
  raised: z.number().nonnegative(),
  goal: z.number().positive(),
  currency: z.string().length(3)
});

export type ChallengeSummary = z.infer<typeof challengeSummarySchema>;

export const challengeLeaderboardSchema = z.object({
  generatedAt: z.string(),
  leaders: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      score: z.number().min(0).max(100)
    })
  )
});

export type ChallengeLeaderboard = z.infer<typeof challengeLeaderboardSchema>;
