import { z } from "zod";
export const donationStatusSchema = z.enum([
  "pending",
  "processing",
  "succeeded",
  "failed"
]);


export const donationSchema = z.object({
  id: z.string(),
  submissionId: z.string(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  status: donationStatusSchema,
  phoneNumber: z.string().nullable().optional(),
  mpesaCheckoutRequestId: z.string().nullable().optional(),
  mpesaReceipt: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
  donorDisplayName: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const donationHistoryEntrySchema = donationSchema.extend({
  challengeId: z.string(),
  challengeTitle: z.string(),
  challengeTagline: z.string().nullable().optional(),
  challengeShareUrl: z.string().url().nullable().optional(),
  submissionTitle: z.string().nullable().optional()
});

export const donationHistoryListSchema = z.array(donationHistoryEntrySchema);

export const donationChallengeContextSchema = z.object({
  id: z.string(),
  title: z.string(),
  tagline: z.string(),
  currency: z.string().length(3),
  goal: z.number().int().nonnegative(),
  raised: z.number().int().nonnegative(),
  shareUrl: z.string().url().nullable().optional()
});

export const donationSubmissionContextSchema = z.object({
  id: z.string(),
  title: z.string().nullable().optional(),
  creatorDisplayName: z.string().nullable().optional(),
  challenge: donationChallengeContextSchema
});

export type DonationStatus = z.infer<typeof donationStatusSchema>;
export type Donation = z.infer<typeof donationSchema>;
export type DonationHistoryEntry = z.infer<typeof donationHistoryEntrySchema>;
export type DonationHistoryList = z.infer<typeof donationHistoryListSchema>;
export type DonationChallengeContext = z.infer<typeof donationChallengeContextSchema>;
export type DonationSubmissionContext = z.infer<typeof donationSubmissionContextSchema>;

