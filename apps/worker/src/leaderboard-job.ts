import { challengeLeaderboardSchema } from "@trendpot/types";

export interface LeaderboardSnapshot {
  generatedAt: string;
  leaders: Array<{ id: string; title: string; score: number }>;
}

// generateLeaderboardSnapshot centralizes the mock payload that the worker
// currently emits so the job handler and the tests can depend on a single
// source of truth.
export const generateLeaderboardSnapshot = (): LeaderboardSnapshot => {
  return challengeLeaderboardSchema.parse({
    generatedAt: new Date().toISOString(),
    leaders: [
      { id: "sunset-sprint", title: "Sunset Sprint", score: 98 },
      { id: "duet-drive", title: "Duet Drive", score: 83 },
      { id: "nightwave", title: "Nightwave", score: 75 }
    ]
  });
};

// createLeaderboardJobHandler wraps the snapshot generator in an async function
// so it matches the signature BullMQ expects and so tests can confirm the
// handler always resolves to valid data.
export const createLeaderboardJobHandler = () => {
  return async () => generateLeaderboardSnapshot();
};
