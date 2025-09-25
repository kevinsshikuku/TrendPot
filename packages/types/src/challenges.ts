import { z } from "zod";
import { submissionConnectionSchema } from "./tiktok";

export const challengeStatusSchema = z.enum(["draft", "live", "archived"]);

export const challengeSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  tagline: z.string(),
  raised: z.number().int().nonnegative(),
  goal: z.number().int().positive(),
  currency: z.string().length(3),
  status: challengeStatusSchema,
  updatedAt: z.string(),
  version: z.number().int().nonnegative()
});

export const challengeSummaryListSchema = z.array(challengeSummarySchema);

export const challengeSchema = challengeSummarySchema.extend({
  description: z.string(),
  createdAt: z.string(),
  submissions: submissionConnectionSchema.nullable().optional()
});

export const challengeStatusBreakdownSchema = z.object({
  draft: z.number().int().nonnegative(),
  live: z.number().int().nonnegative(),
  archived: z.number().int().nonnegative()
});

export const challengeListAnalyticsSchema = z.object({
  totalChallenges: z.number().int().nonnegative(),
  totalRaised: z.number().int().nonnegative(),
  totalGoal: z.number().int().nonnegative(),
  averageCompletion: z.number().min(0),
  statusBreakdown: challengeStatusBreakdownSchema
});

export const challengePageInfoSchema = z.object({
  endCursor: z.string().nullable(),
  hasNextPage: z.boolean()
});

export const challengeEdgeSchema = z.object({
  cursor: z.string(),
  node: challengeSummarySchema
});

export const challengeListSchema = z.object({
  edges: z.array(challengeEdgeSchema),
  pageInfo: challengePageInfoSchema,
  analytics: challengeListAnalyticsSchema
});

export type ChallengeSummary = z.infer<typeof challengeSummarySchema>;
export type ChallengeSummaryList = z.infer<typeof challengeSummaryListSchema>;
export type Challenge = z.infer<typeof challengeSchema>;
export type ChallengeList = z.infer<typeof challengeListSchema>;
export type ChallengeListAnalytics = z.infer<typeof challengeListAnalyticsSchema>;
export type ChallengeStatusBreakdown = z.infer<typeof challengeStatusBreakdownSchema>;
