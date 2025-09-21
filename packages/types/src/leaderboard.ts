import { z } from "zod";

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
