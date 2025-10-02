import { z } from "zod";
import { donationPayoutStateSchema } from "./payouts";
export const donationStatusSchema = z.enum([
  "pending",
  "processing",
  "succeeded",
  "failed",
  "refunded"
]);


export const donationSchema = z.object({
  id: z.string(),
  submissionId: z.string(),
  challengeId: z.string(),
  creatorUserId: z.string(),
  donorUserId: z.string(),
  amountCents: z.number().int().nonnegative(),
  platformFeeCents: z.number().int().nonnegative(),
  creatorShareCents: z.number().int().nonnegative(),
  platformShareCents: z.number().int().nonnegative(),
  platformVatCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  status: donationStatusSchema,
  payoutState: donationPayoutStateSchema,
  statusHistory: z
    .array(
      z.object({
        status: donationStatusSchema,
        occurredAt: z.string(),
        description: z.string().nullable().optional()
      })
    )
    .default([]),
  phoneNumber: z.string().nullable().optional(),
  mpesaCheckoutRequestId: z.string().nullable().optional(),
  mpesaMerchantRequestId: z.string().nullable().optional(),
  mpesaReceipt: z.string().nullable().optional(),
  accountReference: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  lastResponseDescription: z.string().nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
  donorDisplayName: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().nonnegative().optional()
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

