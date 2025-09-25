import { queryOptions } from "@tanstack/react-query";
import { fetchSessions, fetchViewer } from "./auth-client";

export const viewerQueryOptions = () =>
  queryOptions({
    queryKey: ["viewer"],
    queryFn: async () => {
      const { viewer } = await fetchViewer();
      return viewer;
    },
    staleTime: 1000 * 30
  });

export const viewerSessionsQueryOptions = () =>
  queryOptions({
    queryKey: ["viewer", "sessions"],
    queryFn: async () => {
      const { sessions } = await fetchSessions();
      return sessions;
    },
    staleTime: 1000 * 15
  });
