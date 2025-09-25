import { notFound } from "next/navigation";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { EditChallengeForm } from "../../../../../components/admin/create-challenge-form";
import { challengeQueryOptions } from "../../../../../lib/challenge-queries";

interface EditChallengePageProps {
  params: { challengeId: string };
}

export default async function EditChallengePage({ params }: EditChallengePageProps) {
  const queryClient = new QueryClient();
  const query = challengeQueryOptions(params.challengeId);
  await queryClient.prefetchQuery(query);

  const challenge = queryClient.getQueryData(query.queryKey);

  if (!challenge) {
    notFound();
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold text-white">Edit challenge</h1>
          <p className="text-sm text-slate-300">
            Update copy, adjust goals, and archive campaigns without waiting for the next deployment window.
          </p>
        </header>
        <EditChallengeForm challenge={challenge} />
      </div>
    </HydrationBoundary>
  );
}
