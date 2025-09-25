"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@trendpot/ui";
import type { ChallengeSummary } from "@trendpot/types";
import {
  challengeQueryOptions,
  challengesQueryKey,
  createChallengeMutation,
  featuredChallengesQueryKey
} from "../../lib/challenge-queries";

interface FormState {
  id: string;
  title: string;
  tagline: string;
  description: string;
  goal: string;
  currency: string;
  status: string;
}

const defaultState: FormState = {
  id: "",
  title: "",
  tagline: "",
  description: "",
  goal: "50000",
  currency: "KES",
  status: "draft"
};

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "live", label: "Live" },
  { value: "archived", label: "Archived" }
];

const defaultChallengesQueryKey = challengesQueryKey({});

export function CreateChallengeForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(defaultState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createChallengeMutation,
    onSuccess: (challenge) => {
      queryClient.invalidateQueries({ queryKey: featuredChallengesQueryKey });
      queryClient.invalidateQueries({ queryKey: defaultChallengesQueryKey });
      const summary: ChallengeSummary = {
        id: challenge.id,
        title: challenge.title,
        tagline: challenge.tagline,
        raised: challenge.raised,
        goal: challenge.goal,
        currency: challenge.currency
      };

      queryClient.setQueryData(defaultChallengesQueryKey, (existing?: ChallengeSummary[]) =>
        updateChallengeList(existing, summary)
      );

      queryClient.setQueryData(challengesQueryKey({ status: challenge.status }), (existing?: ChallengeSummary[]) =>
        updateChallengeList(existing, summary)
      );

      queryClient.setQueryData(challengeQueryOptions(challenge.id).queryKey, challenge);
      setErrorMessage(null);
      router.push(`/c/${challenge.id}`);
    },
    onError: (error: unknown) => {
      if (error instanceof Error) {
        setErrorMessage(error.message);
        return;
      }
      setErrorMessage("Something went wrong while creating the challenge.");
    }
  });

  const isSubmitting = mutation.isPending;

  const derivedId = useMemo(() => {
    if (form.id.trim().length > 0) {
      return form.id.trim();
    }

    return form.title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }, [form.id, form.title]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setErrorMessage(null);
      const payload = {
        id: derivedId,
        title: form.title,
        tagline: form.tagline,
        description: form.description,
        goal: parseGoalToCents(form.goal),
        currency: form.currency,
        status: form.status
      };

      if (!payload.id) {
        throw new Error("Provide a slug or title so we can generate one.");
      }

      mutation.mutate(payload);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Unable to submit challenge. Check your inputs and try again.");
      }
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="font-medium">Challenge slug</span>
          <input
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            placeholder="e.g. viral-sunrise"
            value={form.id}
            onChange={(event) => setForm((state) => ({ ...state, id: event.target.value }))}
          />
          <span className="text-xs text-slate-400">
            Lowercase URL identifier. Leave blank to auto-generate from the title.
          </span>
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="font-medium">Status</span>
          <select
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            value={form.status}
            onChange={(event) => setForm((state) => ({ ...state, status: event.target.value }))}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-2 text-sm text-slate-200">
        <span className="font-medium">Title</span>
        <input
          className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          placeholder="Celebration Sprint"
          value={form.title}
          onChange={(event) => setForm((state) => ({ ...state, title: event.target.value }))}
          required
        />
      </label>

      <label className="flex flex-col gap-2 text-sm text-slate-200">
        <span className="font-medium">Tagline</span>
        <input
          className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          placeholder="Rally sunrise transitions across Kenya"
          value={form.tagline}
          onChange={(event) => setForm((state) => ({ ...state, tagline: event.target.value }))}
          required
        />
      </label>

      <label className="flex flex-col gap-2 text-sm text-slate-200">
        <span className="font-medium">Description</span>
        <textarea
          className="min-h-[150px] rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          placeholder="Tell creators why this challenge matters..."
          value={form.description}
          onChange={(event) => setForm((state) => ({ ...state, description: event.target.value }))}
          required
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="font-medium">Fundraising goal (major units)</span>
          <input
            type="number"
            min={1}
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            value={form.goal}
            onChange={(event) => setForm((state) => ({ ...state, goal: event.target.value }))}
            required
          />
          <span className="text-xs text-slate-400">Provide the target amount in whole currency (KES) — cents handled automatically.</span>
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="font-medium">Currency</span>
          <input
            className="uppercase rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            value={form.currency}
            onChange={(event) => setForm((state) => ({ ...state, currency: event.target.value }))}
            maxLength={3}
            required
          />
        </label>
      </div>

      {errorMessage && <p className="text-sm text-red-300">{errorMessage}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create challenge"}
        </Button>
        <p className="text-xs text-slate-400">Slug preview: <span className="text-slate-200">/c/{derivedId || "your-slug"}</span></p>
      </div>
    </form>
  );
}

const parseGoalToCents = (value: string): number => {
  const normalized = value.replace(/,/g, "").trim();
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Goal must be a positive number.");
  }

  return Math.round(parsed * 100);
};

const updateChallengeList = (existing: ChallengeSummary[] | undefined, summary: ChallengeSummary) => {
  if (!existing) {
    return [summary];
  }

  const filtered = existing.filter((item) => item.id !== summary.id);
  return [summary, ...filtered];
};
