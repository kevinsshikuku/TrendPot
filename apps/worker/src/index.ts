import { Queue, QueueScheduler, Worker } from "bullmq";
import IORedis from "ioredis";
import { TikTokManagedKeyProvider, TikTokTokenCipher, withRetries } from "@trendpot/utils";
import {
  TIKTOK_INGESTION_QUEUE,
  TIKTOK_REFRESH_QUEUE,
  TikTokInitialSyncJob,
  TikTokMetricsRefreshJob
} from "@trendpot/types";
import { createLeaderboardJobHandler } from "./leaderboard-job";
import { workerLogger } from "./logger";
import { createInitialSyncJobHandler, createMetricsRefreshJobHandler } from "./tiktok/tiktok-jobs";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const baseConnection = new IORedis(redisUrl);
const queueConnection = baseConnection.duplicate();
const schedulerConnection = baseConnection.duplicate();
const redisPublisher = baseConnection.duplicate();

const BACKOFF_DELAY = Number(process.env.TIKTOK_INGESTION_RETRY_BACKOFF_MS ?? 5000);
const MAX_ATTEMPTS = Number(process.env.TIKTOK_INGESTION_MAX_ATTEMPTS ?? 5);
const RATE_LIMIT_PER_MIN = Number(process.env.TIKTOK_INGESTION_RATE_LIMIT_PER_MIN ?? 90);
const PER_QUEUE_RATE_LIMIT = Math.max(1, Math.floor(RATE_LIMIT_PER_MIN / 2));
const INGESTION_CONCURRENCY = Number(process.env.TIKTOK_INGESTION_CONCURRENCY ?? 1);
const REFRESH_CONCURRENCY = Number(process.env.TIKTOK_REFRESH_CONCURRENCY ?? 1);

export const leaderboardQueue = new Queue("leaderboard", { connection: queueConnection });

const ingestionQueue = new Queue<TikTokInitialSyncJob>(TIKTOK_INGESTION_QUEUE, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: MAX_ATTEMPTS,
    backoff: { type: "exponential", delay: BACKOFF_DELAY },
    removeOnComplete: 100,
    removeOnFail: 20
  }
});

const refreshQueue = new Queue<TikTokMetricsRefreshJob>(TIKTOK_REFRESH_QUEUE, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: MAX_ATTEMPTS,
    backoff: { type: "exponential", delay: BACKOFF_DELAY },
    removeOnComplete: 100,
    removeOnFail: 20
  }
});

const ingestionScheduler = new QueueScheduler(TIKTOK_INGESTION_QUEUE, {
  connection: schedulerConnection.duplicate()
});
const refreshScheduler = new QueueScheduler(TIKTOK_REFRESH_QUEUE, {
  connection: schedulerConnection.duplicate()
});

void ingestionScheduler.waitUntilReady();
void refreshScheduler.waitUntilReady();

const bootstrap = async () => {
  const keyProvider = new TikTokManagedKeyProvider();
  const material = await keyProvider.getKeyMaterial();
  const tokenCipher = new TikTokTokenCipher({ key: material.key, keyId: material.keyId });

  const jobHandler = createLeaderboardJobHandler();

  // Worker is instrumented with structured logging to align with the
  // Foundation Hardening milestone deliverable.
  const worker = new Worker(
    leaderboardQueue.name,
    async () => withRetries(jobHandler, { retries: 2 }),
    { connection: baseConnection.duplicate() }
  );

  const initialSyncHandler = createInitialSyncJobHandler({
    refreshQueue,
    redisPublisher,
    tokenCipher
  });
  const metricsRefreshHandler = createMetricsRefreshJobHandler({
    redisPublisher,
    tokenCipher
  });

  const ingestionWorker = new Worker(
    ingestionQueue.name,
    async (job) => initialSyncHandler(job),
    {
      connection: baseConnection.duplicate(),
      concurrency: INGESTION_CONCURRENCY,
      limiter: {
        max: PER_QUEUE_RATE_LIMIT,
        duration: 60_000
      }
    }
  );

  const metricsWorker = new Worker(
    refreshQueue.name,
    async (job) => metricsRefreshHandler(job),
    {
      connection: baseConnection.duplicate(),
      concurrency: REFRESH_CONCURRENCY,
      limiter: {
        max: PER_QUEUE_RATE_LIMIT,
        duration: 60_000
      }
    }
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

  ingestionWorker.on("completed", (job, result) => {
    workerLogger.info(
      { jobId: job.id, queue: job.queueName, result },
      "TikTok initial sync job completed"
    );
  });

  ingestionWorker.on("failed", (job, err) => {
    workerLogger.error(
      { jobId: job?.id, queue: job?.queueName, err: err.message },
      "TikTok initial sync job failed"
    );
  });

  metricsWorker.on("completed", (job, result) => {
    workerLogger.info(
      { jobId: job.id, queue: job.queueName, result },
      "TikTok metrics refresh job completed"
    );
  });

  metricsWorker.on("failed", (job, err) => {
    workerLogger.error(
      { jobId: job?.id, queue: job?.queueName, err: err.message },
      "TikTok metrics refresh job failed"
    );
  });

  workerLogger.info(
    {
      event: "bootstrap.complete",
      queues: [leaderboardQueue.name, ingestionQueue.name, refreshQueue.name],
      keyId: tokenCipher.keyId
    },
    "Worker ready"
  );
};

void bootstrap().catch((error) => {
  workerLogger.fatal(
    { event: "bootstrap.failed", error: error instanceof Error ? error.message : String(error) },
    "Worker bootstrap failed"
  );
  process.exitCode = 1;
});
