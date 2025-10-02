import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker, QueueEvents, JobsOptions } from "bullmq";
import type { Redis } from "ioredis";
import {
  DonationCallbackService,
  MpesaCallbackMetadata,
  MpesaStkPushCallbackPayload
} from "../donations/services/donation-callback.service";
import { apiLogger } from "../observability/logger";
import { RedisService } from "../redis/redis.service";
import type { SignatureVerificationResult } from "./mpesa-signature.service";

export interface MpesaCallbackJobData {
  payload: MpesaStkPushCallbackPayload;
  verification: SignatureVerificationResult;
  metadata: MpesaCallbackMetadata;
}

const QUEUE_NAME = "mpesa:callbacks";
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  removeOnComplete: 1000,
  backoff: {
    type: "exponential",
    delay: 1000
  }
};

@Injectable()
export class MpesaCallbackQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = apiLogger.child({ module: "MpesaCallbackQueue" });
  private queue: Queue<MpesaCallbackJobData> | null = null;
  private worker: Worker<MpesaCallbackJobData> | null = null;
  private events: QueueEvents | null = null;
  private initialized = false;

  constructor(
    private readonly redisService: RedisService,
    private readonly donationCallbackService: DonationCallbackService
  ) {}

  async onModuleInit() {
    const shouldDisable =
      process.env.MPESA_CALLBACK_QUEUE_DISABLED === "true" || process.env.NODE_ENV === "test";

    if (shouldDisable) {
      this.logger.warn(
        { event: "mpesa.queue.disabled" },
        "M-Pesa callback queue disabled; processing inline"
      );
      return;
    }

    const baseConnection = this.redisService.getClient();

    try {
      this.queue = new Queue<MpesaCallbackJobData>(QUEUE_NAME, {
        connection: this.duplicate(baseConnection)
      });

      this.worker = new Worker<MpesaCallbackJobData>(
        QUEUE_NAME,
        async (job) => {
          this.logger.info({ event: "mpesa.queue.job.start", jobId: job.id }, "Processing webhook job");
          await this.donationCallbackService.processStkPushCallback(
            job.data.payload,
            job.data.verification,
            job.data.metadata
          );
        },
        { connection: this.duplicate(baseConnection) }
      );

      this.events = new QueueEvents(QUEUE_NAME, { connection: this.duplicate(baseConnection) });

      this.events.on("failed", ({ jobId, failedReason }) => {
        this.logger.error(
          { event: "mpesa.queue.job.failed", jobId, failedReason },
          "M-Pesa callback job failed"
        );
      });

      this.events.on("completed", ({ jobId }) => {
        this.logger.info({ event: "mpesa.queue.job.completed", jobId }, "M-Pesa callback job completed");
      });

      this.initialized = true;
      this.logger.info({ event: "mpesa.queue.ready" }, "Initialized M-Pesa callback queue");
    } catch (error) {
      this.logger.error(
        { event: "mpesa.queue.init_failed", error: (error as Error).message },
        "Failed to initialize M-Pesa callback queue; falling back to inline processing"
      );
      await this.dispose();
      this.queue = null;
    }
  }

  async enqueue(job: MpesaCallbackJobData) {
    if (!this.queue || !this.initialized) {
      this.logger.warn(
        { event: "mpesa.queue.inline", rawEventId: job.metadata.rawEventId },
        "Queue unavailable; processing callback inline"
      );
      await this.donationCallbackService.processStkPushCallback(job.payload, job.verification, job.metadata);
      return;
    }

    await this.queue.add(`stkpush:${job.metadata.rawEventId}`, job, DEFAULT_JOB_OPTIONS);
    this.logger.info(
      {
        event: "mpesa.queue.job.enqueued",
        rawEventId: job.metadata.rawEventId,
        metric: "mpesa_webhook_enqueued"
      },
      "Enqueued M-Pesa callback job"
    );
  }

  async onModuleDestroy() {
    await this.dispose();
  }

  private duplicate(connection: Redis): Redis {
    return connection.duplicate();
  }

  private async dispose() {
    const disposables = [
      this.worker?.close(),
      this.queue?.close(),
      this.events?.close()
    ].filter(Boolean) as Array<Promise<void>>;

    await Promise.allSettled(disposables);
    this.worker = null;
    this.queue = null;
    this.events = null;
    this.initialized = false;
  }
}
