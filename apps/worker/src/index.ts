import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { withRetries } from "@trendpot/utils";
import { createLeaderboardJobHandler } from "./leaderboard-job";
import { workerLogger } from "./logger";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379");

export const leaderboardQueue = new Queue("leaderboard", { connection });

const jobHandler = createLeaderboardJobHandler();

// Worker is instrumented with structured logging to align with the
// Foundation Hardening milestone deliverable.
const worker = new Worker(
  leaderboardQueue.name,
  async () => withRetries(jobHandler, { retries: 2 }),
  { connection }
);

worker.on("completed", (job, result) => {
  workerLogger.info(
    { jobId: job.id, result },
    "Leaderboard job completed"
  );
});

worker.on("failed", (job, err) => {
  workerLogger.error(
    { jobId: job?.id, err: err.message },
    "Leaderboard job failed"
  );
});

workerLogger.info(
  { event: "bootstrap.complete", queue: leaderboardQueue.name },
  "Worker ready"
);
