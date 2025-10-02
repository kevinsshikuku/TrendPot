import { Body, Controller, Headers, HttpCode, Post, Req, Res } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Model } from "mongoose";
import { apiLogger } from "../observability/logger";
import { AuditLogService } from "../audit/audit-log.service";
import { MpesaCallbackMetadata, MpesaStkPushCallbackPayload } from "../donations/services/donation-callback.service";
import { MpesaCallbackQueue } from "./mpesa-callback.queue";
import { MpesaSignatureService } from "./mpesa-signature.service";
import { WebhookEventDocument, WebhookEventEntity } from "./webhook-event.schema";
import {
  MpesaB2CResultPayload,
  PayoutDisbursementService,
  PayoutResultMetadata
} from "../payouts/services/payout-disbursement.service";

const SIGNATURE_HEADER = "x-safaricom-signature";
const TIMESTAMP_HEADER = "x-safaricom-timestamp";

@Controller("webhooks/mpesa")
export class MpesaWebhookController {
  private readonly logger = apiLogger.child({ module: "MpesaWebhookController" });

  constructor(
    private readonly signatureService: MpesaSignatureService,
    private readonly auditLogService: AuditLogService,
    private readonly callbackQueue: MpesaCallbackQueue,
    private readonly payoutDisbursementService: PayoutDisbursementService,
    @InjectModel(WebhookEventEntity.name)
    private readonly webhookEventModel: Model<WebhookEventDocument>
  ) {}

  @Post("stkpush")
  @HttpCode(202)
  async handleStkPush(
    @Body() body: MpesaStkPushCallbackPayload,
    @Headers(SIGNATURE_HEADER) signature: string | undefined,
    @Headers(TIMESTAMP_HEADER) timestampHeader: string | undefined,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply
  ) {
    const rawPayload = this.resolveRawBody(request, body);
    const verification = this.signatureService.verify({
      payload: rawPayload,
      signature,
      timestampHeader
    });

    const checkoutRequestId = this.extractCheckoutRequestId(body);

    const event = await this.webhookEventModel.create({
      source: "mpesa",
      eventType: "stkpush",
      requestId: String(request.id),
      checkoutRequestId,
      payload: body,
      headers: {
        [SIGNATURE_HEADER]: signature,
        [TIMESTAMP_HEADER]: timestampHeader
      },
      verificationPassed: verification.valid,
      verificationFailureReason: verification.failureReason
    });

    this.logger.info(
      {
        event: "mpesa.webhook.received",
        requestId: request.id,
        checkoutRequestId,
        verification,
        metric: "mpesa_webhook_received"
      },
      "Received M-Pesa webhook"
    );

    if (!verification.valid) {
      await this.auditLogService.record({
        eventType: "webhook.mpesa.stkpush",
        actorType: "webhook",
        actorId: "mpesa",
        outcome: "rejected",
        resourceType: "webhook_event",
        resourceId: event._id.toString(),
        metadata: {
          failureReason: verification.failureReason,
          receivedTimestamp: verification.receivedTimestamp,
          checkoutRequestId,
          rawEventId: event._id.toString(),
          requestId: request.id
        }
      });

      this.logger.warn(
        {
          event: "mpesa.webhook.rejected",
          reason: verification.failureReason,
          requestId: request.id
        },
        "Rejected M-Pesa webhook due to signature verification failure"
      );

      return reply.status(400).send({ status: "rejected" });
    }

    const metadata: MpesaCallbackMetadata = {
      rawEventId: event._id.toString(),
      requestId: String(request.id),
      sourceIp: request.ip
    };

    await this.callbackQueue.enqueue({
      payload: body,
      verification,
      metadata
    });

    this.logger.info(
      {
        event: "mpesa.webhook.queued",
        requestId: request.id,
        checkoutRequestId,
        metric: "mpesa_webhook_valid"
      },
      "Enqueued M-Pesa webhook for processing"
    );

    return reply.status(202).send({ status: "accepted" });
  }

  @Post("b2c/result")
  @HttpCode(202)
  async handleB2CResult(
    @Body() body: MpesaB2CResultPayload,
    @Headers(SIGNATURE_HEADER) signature: string | undefined,
    @Headers(TIMESTAMP_HEADER) timestampHeader: string | undefined,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply
  ) {
    const rawPayload = this.resolveRawBody(request, body);
    const verification = this.signatureService.verify({
      payload: rawPayload,
      signature,
      timestampHeader
    });

    const conversationId = body?.Result?.ConversationID ?? body?.Result?.OriginatorConversationID;

    const event = await this.webhookEventModel.create({
      source: "mpesa",
      eventType: "b2c.result",
      requestId: String(request.id),
      payload: body,
      headers: {
        [SIGNATURE_HEADER]: signature,
        [TIMESTAMP_HEADER]: timestampHeader
      },
      verificationPassed: verification.valid,
      verificationFailureReason: verification.failureReason,
      conversationId
    });

    const metadata: PayoutResultMetadata = {
      rawEventId: event._id.toString(),
      requestId: String(request.id),
      sourceIp: request.ip
    };

    if (!verification.valid) {
      await this.auditLogService.record({
        eventType: "webhook.mpesa.b2c",
        actorType: "webhook",
        actorId: "mpesa",
        outcome: "rejected",
        resourceType: "webhook_event",
        resourceId: event._id.toString(),
        metadata: {
          failureReason: verification.failureReason,
          receivedTimestamp: verification.receivedTimestamp,
          conversationId,
          rawEventId: metadata.rawEventId,
          requestId: request.id
        }
      });

      this.logger.warn(
        {
          event: "mpesa.webhook.rejected",
          reason: verification.failureReason,
          requestId: request.id,
          conversationId
        },
        "Rejected M-Pesa B2C webhook due to signature verification failure"
      );

      return reply.status(400).send({ status: "rejected" });
    }

    await this.payoutDisbursementService.handleResultCallback(body, metadata);

    await this.auditLogService.record({
      eventType: "webhook.mpesa.b2c",
      actorType: "webhook",
      actorId: "mpesa",
      outcome: "processed",
      resourceType: "webhook_event",
      resourceId: event._id.toString(),
      metadata: {
        conversationId,
        rawEventId: metadata.rawEventId
      }
    });

    this.logger.info(
      {
        event: "mpesa.webhook.b2c_processed",
        requestId: request.id,
        conversationId,
        metric: "mpesa_b2c_callback_processed"
      },
      "Processed M-Pesa B2C result webhook"
    );

    return reply.status(202).send({ status: "accepted" });
  }

  private resolveRawBody(request: FastifyRequest, fallback: unknown): string {
    const raw = (request as FastifyRequest & { rawBody?: string | Buffer }).rawBody;

    if (typeof raw === "string") {
      return raw;
    }

    if (raw instanceof Buffer) {
      return raw.toString("utf8");
    }

    return JSON.stringify(fallback ?? {});
  }

  private extractCheckoutRequestId(body: MpesaStkPushCallbackPayload): string | undefined {
    return body?.Body?.stkCallback?.CheckoutRequestID;
  }
}
