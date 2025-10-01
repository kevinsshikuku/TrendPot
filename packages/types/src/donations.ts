import { z } from "zod";

export const donationStatusSchema = z.enum(["pending", "submitted", "paid", "failed"]);

export const donationStatusChangeSchema = z.object({
  status: donationStatusSchema,
  occurredAt: z.string(),
  description: z.string().nullable()
});

export const donationSchema = z.object({
  id: z.string(),
  submissionId: z.string(),
  donorUserId: z.string(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  status: donationStatusSchema,
  statusHistory: z.array(donationStatusChangeSchema),
  mpesaCheckoutRequestId: z.string().nullable(),
  mpesaMerchantRequestId: z.string().nullable(),
  failureReason: z.string().nullable(),
  lastResponseDescription: z.string().nullable(),
  accountReference: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().nonnegative()
});

export type DonationStatus = z.infer<typeof donationStatusSchema>;
export type DonationStatusChange = z.infer<typeof donationStatusChangeSchema>;
export type Donation = z.infer<typeof donationSchema>;
