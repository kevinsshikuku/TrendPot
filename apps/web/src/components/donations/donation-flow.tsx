"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Donation,
  type DonationHistoryEntry,
  type DonationSubmissionContext,
  type RequestStkPushInput
} from "@trendpot/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DonationForm, type DonationFormSubmission } from "./donation-form";
import { DonationHistory } from "./donation-history";
import { DonationReceipt } from "./donation-receipt";
import {
  donationHistoryQueryKey,
  donationHistoryQueryOptions,
  donationStatusQueryKey,
  donationStatusQueryOptions,
  requestStkPushMutation,
  submissionDonationContextQueryOptions
} from "../../lib/donation-queries";

interface DonationExperienceProps {
  submissionId: string;
}

interface ToastMessage {
  id: string;
  tone: "success" | "info" | "error";
  message: string;
}

const ToastStack = ({ toasts, dismiss }: { toasts: ToastMessage[]; dismiss: (id: string) => void }) => {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
      {toasts.map((toast) => {
        const toneStyles: Record<ToastMessage["tone"], string> = {
          success: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
          info: "border-sky-400/40 bg-sky-500/10 text-sky-100",
          error: "border-rose-400/40 bg-rose-500/10 text-rose-100"
        };

        return (
          <div
            key={toast.id}
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg shadow-slate-950/40 ${toneStyles[toast.tone]}`}
            data-testid="donation-toast"
          >
            <p className="flex-1">{toast.message}</p>
            <button
              type="button"
              className="text-xs uppercase tracking-wide text-slate-200"
              onClick={() => dismiss(toast.id)}
            >
              Close
            </button>
          </div>
        );
      })}
    </div>
  );
};

const useDonationToasts = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((tone: ToastMessage["tone"], message: string) => {
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `toast-${Date.now()}`;
    setToasts((current) => [...current, { id, tone, message }]);
    setTimeout(() => dismiss(id), 3500);
  }, [dismiss]);

  return { toasts, push, dismiss };
};

export function DonationExperience({ submissionId }: DonationExperienceProps) {
  const queryClient = useQueryClient();
  const { toasts, push: pushToast, dismiss } = useDonationToasts();
  const [activeDonationId, setActiveDonationId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const lastStatusRef = useRef<Donation["status"] | null>(null);

  const contextQuery = useQuery(submissionDonationContextQueryOptions(submissionId));

  const historyParams = useMemo(() => ({ first: 10 }), []);
  const historyQuery = useQuery(donationHistoryQueryOptions(historyParams));

  const donationStatusQuery = useQuery({
    ...donationStatusQueryOptions(activeDonationId ?? ""),
    enabled: Boolean(activeDonationId),
    refetchInterval: (latest: Donation | null) => {
      if (!latest) {
        return 3000;
      }
      return latest.status === "pending" || latest.status === "processing" ? 3000 : false;
    }
  });

  const donationMutation = useMutation({
    mutationFn: (input: RequestStkPushInput) => requestStkPushMutation(input),
    onMutate: () => {
      setFormError(null);
      lastStatusRef.current = null;
    },
    onSuccess: (donation) => {
      setActiveDonationId(donation.id);
      pushToast("info", "STK push sent. Approve on your phone to finish the donation.");
      queryClient.setQueryData(donationStatusQueryKey(donation.id), donation);
      queryClient.invalidateQueries({ queryKey: donationHistoryQueryKey(historyParams) });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to initiate donation.";
      setFormError(message);
      pushToast("error", message);
    }
  });

  const activeContext: DonationSubmissionContext | null = contextQuery.data ?? null;
  const activeDonation: Donation | null = donationStatusQuery.data ?? null;
  const optimisticDonation: Donation | null = donationMutation.data ?? activeDonation ?? null;
  const donationHistory: DonationHistoryEntry[] = historyQuery.data ?? [];

  useEffect(() => {
    if (!activeDonation) {
      return;
    }

    if (lastStatusRef.current && lastStatusRef.current !== activeDonation.status) {
      if (activeDonation.status === "succeeded") {
        pushToast("success", "Donation paid! Thank you for the support.");
        queryClient.invalidateQueries({ queryKey: donationHistoryQueryKey(historyParams) });
      } else if (activeDonation.status === "failed") {
        pushToast("error", activeDonation.failureReason ?? "Donation failed. Please try again.");
      }
    }

    lastStatusRef.current = activeDonation.status;
  }, [activeDonation, pushToast, queryClient]);

  const handleSubmit = useCallback(
    (submission: DonationFormSubmission) => {
      const input: RequestStkPushInput = {
        submissionId,
        amountCents: submission.amountCents,
        phoneNumber: submission.phoneNumber,
        idempotencyKey: submission.idempotencyKey,
        donorDisplayName: submission.donorDisplayName
      };

      donationMutation.mutate(input);
    },
    [donationMutation, submissionId]
  );

  const isLoadingContext = contextQuery.isLoading;

  return (
    <div className="relative">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-8">
          <DonationForm
            challengeTitle={activeContext?.challenge.title ?? "this challenge"}
            currency={activeContext?.challenge.currency ?? "KES"}
            onSubmit={handleSubmit}
            isSubmitting={donationMutation.isPending}
            disabled={isLoadingContext || donationMutation.isPending}
            serverError={formError}
          />
        </div>
        <div className="flex flex-col gap-8">
          <DonationReceipt
            donation={optimisticDonation}
            challengeTitle={activeContext?.challenge.title ?? "Challenge"}
            fallbackCurrency={activeContext?.challenge.currency ?? "KES"}
            shareUrl={activeContext?.challenge.shareUrl}
            optimistic={donationMutation.isPending && !optimisticDonation}
          />
          <DonationHistory
            donations={donationHistory}
            fallbackCurrency={activeContext?.challenge.currency ?? "KES"}
          />
        </div>
      </div>
      <ToastStack toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
