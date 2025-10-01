"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreatorDonationConnection,
  PayoutBatchConnection,
  PayoutNotificationConnection
} from "@trendpot/types";
import {
  creatorDonationsQueryOptions,
  fetchCreatorDonations,
  markPayoutNotificationsRead,
  payoutBatchesQueryOptions,
  payoutNotificationsQueryOptions
} from "@/lib/payouts-queries";
import { CreatorDonationsTable } from "./creator-donations-table";
import { CreatorEarningsSummary } from "./creator-earnings-summary";
import { PayoutBatchesCard } from "./payout-batches-card";
import { PayoutNotificationCenter } from "./payout-notification-center";

interface CreatorPayoutDashboardProps {
  initialDonations?: CreatorDonationConnection;
  initialBatches?: PayoutBatchConnection;
  initialNotifications?: PayoutNotificationConnection;
}

export function CreatorPayoutDashboard({
  initialDonations,
  initialBatches,
  initialNotifications
}: CreatorPayoutDashboardProps) {
  const queryClient = useQueryClient();
  const donationOptions = useMemo(() => creatorDonationsQueryOptions({ first: 20 }), []);
  const batchOptions = useMemo(() => payoutBatchesQueryOptions({ first: 6 }), []);
  const notificationOptions = useMemo(() => payoutNotificationsQueryOptions({ first: 10 }), []);

  const donationsQuery = useQuery({ ...donationOptions, initialData: initialDonations });
  const batchesQuery = useQuery({ ...batchOptions, initialData: initialBatches });
  const notificationsQuery = useQuery({ ...notificationOptions, initialData: initialNotifications });
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const markNotifications = useMutation({
    mutationFn: markPayoutNotificationsRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationOptions.queryKey });
    }
  });

  const handleLoadMoreDonations = async () => {
    if (!donationsQuery.data?.pageInfo.hasNextPage || !donationsQuery.data.pageInfo.endCursor) {
      return;
    }

    setIsFetchingMore(true);
    try {
      const next = await fetchCreatorDonations({
        first: 20,
        after: donationsQuery.data.pageInfo.endCursor
      });

      queryClient.setQueryData<CreatorDonationConnection | undefined>(donationOptions.queryKey, (current) => {
        if (!current) {
          return next;
        }

        return {
          ...next,
          edges: [...current.edges, ...next.edges],
          stats: next.stats,
          trend: next.trend,
          pageInfo: next.pageInfo
        };
      });
    } finally {
      setIsFetchingMore(false);
    }
  };

  const donationConnection = queryClient.getQueryData<CreatorDonationConnection>(donationOptions.queryKey);
  const batchesConnection = batchesQuery.data;
  const notificationConnection = notificationsQuery.data;

  return (
    <section className="flex flex-col gap-8" aria-label="Creator payouts dashboard">
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <CreatorEarningsSummary
          connection={donationConnection ?? donationsQuery.data}
          isLoading={donationsQuery.isLoading || donationsQuery.isFetching}
          error={donationsQuery.isError ? (donationsQuery.error as Error).message : null}
        />
        <PayoutBatchesCard connection={batchesConnection} isLoading={batchesQuery.isFetching} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <CreatorDonationsTable
          connection={donationConnection ?? donationsQuery.data}
          isLoading={donationsQuery.isFetching}
          onLoadMore={handleLoadMoreDonations}
          isFetchingMore={isFetchingMore}
        />
        <PayoutNotificationCenter
          connection={notificationConnection}
          isLoading={notificationsQuery.isFetching}
          isMutating={markNotifications.isPending}
          onMarkAsRead={async (ids) => {
            await markNotifications.mutateAsync(ids);
          }}
        />
      </div>
    </section>
  );
}
