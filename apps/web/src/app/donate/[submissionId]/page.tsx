import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { DonationExperience } from "../../../components/donations/donation-flow";
import {
  donationHistoryQueryOptions,
  submissionDonationContextQueryOptions
} from "../../../lib/donation-queries";

interface DonatePageProps {
  params: { submissionId: string };
}

export default async function DonatePage({ params }: DonatePageProps) {
  const submissionId = params.submissionId;
  const queryClient = new QueryClient();

  const context = await queryClient.fetchQuery(submissionDonationContextQueryOptions(submissionId));

  if (!context) {
    notFound();
  }

  await queryClient.prefetchQuery(donationHistoryQueryOptions({ first: 10 }));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DonationExperience submissionId={submissionId} />
    </HydrationBoundary>
  );
}
