"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@trendpot/ui";
import type { Challenge, ChallengeSummary } from "@trendpot/types";
import {
  archiveChallengeMutation,
  challengeQueryOptions,
  challengesQueryKey,
  createChallengeMutation,
  featuredChallengesQueryKey,
  updateChallengeMutation
} from "../../lib/challenge-queries";
import { ProfileCompletionRequiredError } from "../../lib/errors";

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
  goal: "500",
  currency: "KES",
  status: "draft"
};

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "live", label: "Live" },
  { value: "archived", label: "Archived" }
];

const defaultChallengesQueryKey = challengesQueryKey({});

const formatProfileError = (error: ProfileCompletionRequiredError) => {
  const missing = error.missingFields
    .map((field) => (field === "phone" ? "phone number" : field === "displayName" ? "display name" : field))
    .join(", ");

  const suffix = missing.length > 0 ? ` Missing: ${missing}.` : "";
  return `${error.message}${suffix} Update your profile on the account page and try again.`;
};

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
      queryClient.invalidateQueries({ queryKey: ["challenges", "admin"] });

      const summary: ChallengeSummary = {
        id: challenge.id,
        title: challenge.title,
        tagline: challenge.tagline,
        raised: challenge.raised,
        goal: challenge.goal,
        currency: challenge.currency,
        status: challenge.status,
        updatedAt: challenge.updatedAt,
        version: challenge.version
      };

      queryClient.setQueryData(defaultChallengesQueryKey, (existing?: ChallengeSummary[]) =>
        upsertChallengeSummary(existing, summary)
      );

      queryClient.setQueryData(challengesQueryKey({ status: challenge.status }), (existing?: ChallengeSummary[]) =>
        upsertChallengeSummary(existing, summary)
      );

      queryClient.setQueryData(challengeQueryOptions(challenge.id).queryKey, challenge);
      setErrorMessage(null);
      router.push(`/c/${challenge.id}`);
    },
    onError: (error: unknown) => {
      if (error instanceof ProfileCompletionRequiredError) {
        setErrorMessage(formatProfileError(error));
        return;
      }
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
      <ChallengeFormFields
        form={form}
        derivedId={derivedId}
        onChange={setForm}
        disabled={isSubmitting}
        mode="create"
      />

      {errorMessage && <p className="text-sm text-red-300">{errorMessage}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create challenge"}
        </Button>
        <p className="text-xs text-slate-400">
          Slug preview: <span className="text-slate-200">/c/{derivedId || "your-slug"}</span>
        </p>
      </div>
    </form>
  );
}

interface EditChallengeFormProps {
  challenge: Challenge;
}

export function EditChallengeForm({ challenge }: EditChallengeFormProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({
    id: challenge.id,
    title: challenge.title,
    tagline: challenge.tagline,
    description: challenge.description,
    goal: formatGoalFromCents(challenge.goal),
    currency: challenge.currency,
    status: challenge.status
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: updateChallengeMutation,
    onSuccess: (updated) => {
      writeChallengeCache(queryClient, updated);
      setErrorMessage(null);
    },
    onError: (error: unknown) => {
      if (error instanceof ProfileCompletionRequiredError) {
        setErrorMessage(formatProfileError(error));
        return;
      }
      if (error instanceof Error) {
        setErrorMessage(error.message);
        return;
      }
      setErrorMessage("Unable to save updates. Please try again.");
    }
  });

  const archiveMutation = useMutation({
    mutationFn: archiveChallengeMutation,
    onSuccess: (archived) => {
      writeChallengeCache(queryClient, archived);
      setErrorMessage(null);
    },
    onError: (error: unknown) => {
      if (error instanceof ProfileCompletionRequiredError) {
        setErrorMessage(formatProfileError(error));
        return;
      }
      if (error instanceof Error) {
        setErrorMessage(error.message);
        return;
      }
      setErrorMessage("Archiving failed. Refresh and try again.");
    }
  });

  const isSubmitting = updateMutation.isPending || archiveMutation.isPending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const changes: Record<string, unknown> = {};

    if (form.title !== challenge.title) {
      changes.title = form.title.trim();
    }

    if (form.tagline !== challenge.tagline) {
      changes.tagline = form.tagline.trim();
    }

    if (form.description !== challenge.description) {
      changes.description = form.description.trim();
    }

    if (form.goal !== formatGoalFromCents(challenge.goal)) {
      changes.goal = parseGoalToCents(form.goal);
    }

    if (form.currency !== challenge.currency) {
      changes.currency = form.currency.trim();
    }

    if (form.status !== challenge.status) {
      changes.status = form.status;
    }

    if (Object.keys(changes).length === 0) {
      setErrorMessage("No changes detected. Update a field before saving.");
      return;
    }

    updateMutation.mutate({
      id: challenge.id,
      expectedVersion: challenge.version,
      ...changes
    });
  };

  const handleArchive = () => {
    archiveMutation.mutate({ id: challenge.id, expectedVersion: challenge.version });
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <ChallengeFormFields
        form={form}
        derivedId={challenge.id}
        onChange={setForm}
        disabled={isSubmitting}
        mode="edit"
      />

      {errorMessage && <p className="text-sm text-red-300">{errorMessage}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isSubmitting || challenge.status === "archived"}
          onClick={handleArchive}
        >
          {archiveMutation.isPending ? "Archiving..." : "Archive challenge"}
        </Button>
      </div>
    </form>
  );
}

interface ChallengeFormFieldsProps {
  form: FormState;
  derivedId: string;
  disabled: boolean;
  mode: "create" | "edit";
  onChange: (updater: (state: FormState) => FormState) => void;
}

function ChallengeFormFields({ form, derivedId, onChange, disabled, mode }: ChallengeFormFieldsProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="font-medium">Challenge slug</span>
          <input
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            placeholder="e.g. viral-sunrise"
            value={form.id}
            disabled={disabled || mode === "edit"}
            onChange={(event) => onChange((state) => ({ ...state, id: event.target.value }))}
          />
          <span className="text-xs text-slate-400">
            {mode === "create"
              ? "Lowercase URL identifier. Leave blank to auto-generate from the title."
              : "Slug is immutable once created so existing links never break."}
          </span>
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="font-medium">Status</span>
          <select
            className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            value={form.status}
            disabled={disabled}
            onChange={(event) => onChange((state) => ({ ...state, status: event.target.value }))}
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
          disabled={disabled}
          onChange={(event) => onChange((state) => ({ ...state, title: event.target.value }))}
          required
        />
      </label>

      <label className="flex flex-col gap-2 text-sm text-slate-200">
        <span className="font-medium">Tagline</span>
        <input
          className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          placeholder="Rally sunrise transitions across Kenya"
          value={form.tagline}
          disabled={disabled}
          onChange={(event) => onChange((state) => ({ ...state, tagline: event.target.value }))}
          required
        />
      </label>

      <label className="flex flex-col gap-2 text-sm text-slate-200">
        <span className="font-medium">Description</span>
        <textarea
          className="min-h-[150px] rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          placeholder="Tell creators why this challenge matters..."
          value={form.description}
          disabled={disabled}
          onChange={(event) => onChange((state) => ({ ...state, description: event.target.value }))}
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
            disabled={disabled}
            onChange={(event) => onChange((state) => ({ ...state, goal: event.target.value }))}
            required
          />
          <span className="text-xs text-slate-400">Provide the target amount in whole currency (KES) — cents handled automatically.</span>
        </label>
        <label className="flex flex-col gap-2 text-sm text-slate-200">
          <span className="font-medium">Currency</span>
          <input
            className="uppercase rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            value={form.currency}
            disabled={disabled}
            onChange={(event) => onChange((state) => ({ ...state, currency: event.target.value }))}
            maxLength={3}
            required
          />
        </label>
      </div>

      {mode === "edit" && (
        <p className="text-xs text-slate-400">
          Current slug: <span className="text-slate-200">/c/{derivedId}</span>
        </p>
      )}
    </div>
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

const formatGoalFromCents = (cents: number): string => {
  return (cents / 100).toString();
};

const upsertChallengeSummary = (existing: ChallengeSummary[] | undefined, summary: ChallengeSummary) => {
  if (!existing) {
    return [summary];
  }

  const filtered = existing.filter((item) => item.id !== summary.id);
  return [summary, ...filtered];
};

const writeChallengeCache = (queryClient: ReturnType<typeof useQueryClient>, challenge: Challenge) => {
  const summary: ChallengeSummary = {
    id: challenge.id,
    title: challenge.title,
    tagline: challenge.tagline,
    raised: challenge.raised,
    goal: challenge.goal,
    currency: challenge.currency,
    status: challenge.status,
    updatedAt: challenge.updatedAt,
    version: challenge.version
  };

  queryClient.invalidateQueries({ queryKey: featuredChallengesQueryKey });
  queryClient.invalidateQueries({ queryKey: defaultChallengesQueryKey });
  queryClient.invalidateQueries({ queryKey: ["challenges", "admin"] });

  queryClient.setQueryData(defaultChallengesQueryKey, (existing?: ChallengeSummary[]) =>
    upsertChallengeSummary(existing, summary)
  );

  queryClient.setQueryData(challengesQueryKey({ status: challenge.status }), (existing?: ChallengeSummary[]) =>
    upsertChallengeSummary(existing, summary)
  );

  queryClient.setQueryData(challengeQueryOptions(challenge.id).queryKey, challenge);
};
