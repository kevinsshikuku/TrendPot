import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { challengeLeaderboardSchema } from "@trendpot/types";
import { withRetries } from "@trendpot/utils";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379");

export const leaderboardQueue = new Queue("leaderboard", { connection });

const jobHandler = async () => {
  const payload = challengeLeaderboardSchema.parse({
    generatedAt: new Date().toISOString(),
    leaders: [
      { id: "sunset-sprint", title: "Sunset Sprint", score: 98 },
      { id: "duet-drive", title: "Duet Drive", score: 83 },
      { id: "nightwave", title: "Nightwave", score: 75 }
    ]
  });

  return payload;
};

const worker = new Worker(
  leaderboardQueue.name,
  async () => withRetries(jobHandler, { retries: 2 }),
  { connection }
);

worker.on("completed", (job, result) => {
  console.log(`[leaderboard] job ${job.id} completed`, result);
});

worker.on("failed", (job, err) => {
  console.error(`[leaderboard] job ${job?.id} failed`, err);
});

console.log("📊 Worker ready to process leaderboard jobs");
