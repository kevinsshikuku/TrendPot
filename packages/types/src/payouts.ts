import { z } from "zod";

export const donationStatusSchema = z.enum(["pending", "succeeded", "refunded", "failed"]);
export type DonationStatus = z.infer<typeof donationStatusSchema>;

export const donationPayoutStateSchema = z.enum([
  "unassigned",
  "scheduled",
  "processing",
  "paid",
  "failed"
]);
export type DonationPayoutState = z.infer<typeof donationPayoutStateSchema>;

export const creatorDonationSchema = z.object({
  id: z.string(),
  status: donationStatusSchema,
  payoutState: donationPayoutStateSchema,
  amountCents: z.number().int().nonnegative(),
  netAmountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  donatedAt: z.string(),
  availableAt: z.string().nullable(),
  supporterName: z.string().nullable(),
  challengeTitle: z.string().nullable(),
  payoutBatchId: z.string().nullable()
});
export type CreatorDonation = z.infer<typeof creatorDonationSchema>;

export const creatorDonationEdgeSchema = z.object({
  cursor: z.string(),
  node: creatorDonationSchema
});

export const creatorDonationStatsSchema = z.object({
  lifetimeAmountCents: z.number().int().nonnegative(),
  lifetimeDonationCount: z.number().int().nonnegative(),
  pendingAmountCents: z.number().int().nonnegative(),
  availableAmountCents: z.number().int().nonnegative()
});

export const creatorDonationTrendPointSchema = z.object({
  date: z.string(),
  amountCents: z.number().int().nonnegative()
});

export const connectionPageInfoSchema = z.object({
  endCursor: z.string().nullable(),
  hasNextPage: z.boolean()
});

export const creatorDonationConnectionSchema = z.object({
  edges: z.array(creatorDonationEdgeSchema),
  pageInfo: connectionPageInfoSchema,
  stats: creatorDonationStatsSchema,
  trend: z.array(creatorDonationTrendPointSchema)
});
export type CreatorDonationConnection = z.infer<typeof creatorDonationConnectionSchema>;

export const payoutBatchStatusSchema = z.enum(["scheduled", "processing", "paid", "failed"]);
export type PayoutBatchStatus = z.infer<typeof payoutBatchStatusSchema>;

export const payoutBatchSchema = z.object({
  id: z.string(),
  status: payoutBatchStatusSchema,
  scheduledFor: z.string(),
  completedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  donationCount: z.number().int().nonnegative(),
  totalAmountCents: z.number().int().nonnegative(),
  netAmountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  failureReason: z.string().nullable()
});
export type PayoutBatch = z.infer<typeof payoutBatchSchema>;

export const payoutBatchEdgeSchema = z.object({
  cursor: z.string(),
  node: payoutBatchSchema
});

export const payoutBatchConnectionSchema = z.object({
  edges: z.array(payoutBatchEdgeSchema),
  pageInfo: connectionPageInfoSchema
});
export type PayoutBatchConnection = z.infer<typeof payoutBatchConnectionSchema>;

export const payoutNotificationTypeSchema = z.enum([
  "donation.cleared",
  "payout.scheduled",
  "payout.processing",
  "payout.paid",
  "payout.failed"
]);
export type PayoutNotificationType = z.infer<typeof payoutNotificationTypeSchema>;

export const payoutNotificationMetadataSchema = z
  .object({
    donationId: z.string().optional(),
    payoutBatchId: z.string().optional(),
    amountCents: z.number().int().nonnegative().optional(),
    currency: z.string().length(3).optional()
  })
  .nullable();

export const payoutNotificationSchema = z.object({
  id: z.string(),
  type: payoutNotificationTypeSchema,
  message: z.string(),
  createdAt: z.string(),
  eventAt: z.string(),
  readAt: z.string().nullable(),
  metadata: payoutNotificationMetadataSchema
});
export type PayoutNotification = z.infer<typeof payoutNotificationSchema>;

export const payoutNotificationEdgeSchema = z.object({
  cursor: z.string(),
  node: payoutNotificationSchema
});

export const payoutNotificationConnectionSchema = z.object({
  edges: z.array(payoutNotificationEdgeSchema),
  pageInfo: connectionPageInfoSchema
});
export type PayoutNotificationConnection = z.infer<typeof payoutNotificationConnectionSchema>;
