import { z } from "zod";

export const challengeStatusSchema = z.enum(["draft", "live", "archived"]);

export const challengeSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  tagline: z.string(),
  raised: z.number().int().nonnegative(),
  goal: z.number().int().positive(),
  currency: z.string().length(3)
});

export const challengeSummaryListSchema = z.array(challengeSummarySchema);

export const challengeSchema = challengeSummarySchema.extend({
  description: z.string(),
  status: challengeStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

export type ChallengeSummary = z.infer<typeof challengeSummarySchema>;
export type ChallengeSummaryList = z.infer<typeof challengeSummaryListSchema>;
export type Challenge = z.infer<typeof challengeSchema>;
