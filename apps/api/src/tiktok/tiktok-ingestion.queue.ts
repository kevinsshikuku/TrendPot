import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  TIKTOK_INGESTION_QUEUE,
  TikTokInitialSyncJob,
  tiktokInitialSyncJobSchema
} from "@trendpot/types";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const MAX_ATTEMPTS = Number(process.env.TIKTOK_INGESTION_MAX_ATTEMPTS ?? 5);
const BACKOFF_DELAY = Number(process.env.TIKTOK_INGESTION_RETRY_BACKOFF_MS ?? 5000);

@Injectable()
export class TikTokIngestionQueue implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly queue: Queue<TikTokInitialSyncJob>;

  constructor() {
    this.connection = new IORedis(REDIS_URL);
    this.queue = new Queue(TIKTOK_INGESTION_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 20,
        attempts: MAX_ATTEMPTS,
        backoff: {
          type: "exponential",
          delay: BACKOFF_DELAY
        }
      }
    });
  }

  async enqueueInitialSync(params: {
    accountId: string;
    userId: string;
    trigger?: TikTokInitialSyncJob["trigger"];
    requestId?: string;
    queuedAt?: string;
  }): Promise<void> {
    const trigger = params.trigger ?? "account_linked";
    const queuedAt = params.queuedAt ?? new Date().toISOString();

    const payload = tiktokInitialSyncJobSchema.parse({
      accountId: params.accountId,
      userId: params.userId,
      trigger,
      requestId: params.requestId,
      queuedAt
    });

    await this.queue.add(
      "initial-sync",
      payload,
      {
        jobId: `initial:${payload.accountId}:${payload.queuedAt}`,
        removeOnComplete: 100,
        removeOnFail: 20
      }
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}
