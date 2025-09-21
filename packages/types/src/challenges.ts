import { z } from "zod";

export const challengeSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  tagline: z.string(),
  raised: z.number().nonnegative(),
  goal: z.number().positive(),
  currency: z.string().length(3)
});

export const challengeSummaryListSchema = z.array(challengeSummarySchema);

export type ChallengeSummary = z.infer<typeof challengeSummarySchema>;
export type ChallengeSummaryList = z.infer<typeof challengeSummaryListSchema>;
