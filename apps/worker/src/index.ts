import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { withRetries } from "@trendpot/utils";
import { createLeaderboardJobHandler } from "./leaderboard-job";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379");

export const leaderboardQueue = new Queue("leaderboard", { connection });

const jobHandler = createLeaderboardJobHandler();

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
