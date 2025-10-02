import { Injectable, Logger } from "@nestjs/common";
import type { RetryOptions } from "@trendpot/utils";
import { AesGcmCipher, type AesGcmCipherOptions, withRetries } from "@trendpot/utils";

type LoggerCandidate = Logger | {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  log?: (...args: unknown[]) => void;
};

interface DarajaClientOptions {
  baseUrl?: string;
  consumerKey?: string;
  consumerSecret?: string;
  shortCode?: string;
  passkey?: string;
  callbackUrl?: string;
  b2cInitiatorName?: string;
  b2cSecurityCredential?: string;
  b2cResultUrl?: string;
  b2cQueueTimeoutUrl?: string;
  retry?: RetryOptions;
  fetchImplementation?: typeof fetch;
  cipher?: AesGcmCipher;
  cipherOptions?: AesGcmCipherOptions;
}

export interface DarajaStkPushRequest {
  amount: number;
  phoneNumber: string;
  accountReference: string;
  description: string;
  requestId?: string;
  logger?: LoggerCandidate;
}

export interface DarajaStkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export interface DarajaB2CPayoutRequest {
  amount: number;
  phoneNumber: string;
  remarks?: string;
  occasion?: string;
  requestId?: string;
  logger?: LoggerCandidate;
}

export interface DarajaB2CPayoutResponse {
  ConversationID: string;
  OriginatorConversationID: string;
  ResponseCode: string;
  ResponseDescription: string;
}

interface AccessTokenResponse {
  access_token: string;
  expires_in: string | number;
}

const DARAJA_BASE_URLS = {
  production: "https://api.safaricom.co.ke",
  sandbox: "https://sandbox.safaricom.co.ke"
} as const;

const DEFAULT_RETRY_OPTIONS: RetryOptions = { retries: 2, delayMs: 500 };
const DEFAULT_CREDENTIAL_KEY_ID = "mpesa-local";
const DEFAULT_CREDENTIAL_FALLBACK_SECRET = "trendpot-mpesa-credential";

const resolveBaseUrl = (env?: string) => {
  if (env && env.toLowerCase() === "production") {
    return DARAJA_BASE_URLS.production;
  }
  return DARAJA_BASE_URLS.sandbox;
};

const formatTimestamp = (date: Date) => {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
};

@Injectable()
export class DarajaClient {
  private readonly logger = new Logger(DarajaClient.name);
  private readonly baseUrl: string;
  private readonly consumerKey: string;
  private readonly consumerSecret: string;
  private readonly shortCode: string;
  private readonly passkey: string;
  private readonly callbackUrl: string;
  private readonly b2cInitiatorName: string;
  private readonly b2cSecurityCredential: string;
  private readonly b2cResultUrl: string;
  private readonly b2cQueueTimeoutUrl: string;
  private readonly retryOptions: RetryOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly cipher: AesGcmCipher;
  private readonly encryptedCredentials: ReturnType<AesGcmCipher["encrypt"]>;
  private readonly fallbackLogger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    log: (...args: unknown[]) => void;
  };
  private accessTokenCache: { token: string; expiresAt: number } | null = null;

  constructor(options: DarajaClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? resolveBaseUrl(process.env.MPESA_ENV);
    this.consumerKey = options.consumerKey ?? process.env.MPESA_CONSUMER_KEY ?? "";
    this.consumerSecret = options.consumerSecret ?? process.env.MPESA_CONSUMER_SECRET ?? "";
    this.shortCode = options.shortCode ?? process.env.MPESA_SHORT_CODE ?? "";
    this.passkey = options.passkey ?? process.env.MPESA_PASSKEY ?? "";
    this.callbackUrl = options.callbackUrl ?? process.env.MPESA_CALLBACK_URL ?? "";
    this.b2cInitiatorName = options.b2cInitiatorName ?? process.env.MPESA_B2C_INITIATOR_NAME ?? "";
    this.b2cSecurityCredential =
      options.b2cSecurityCredential ?? process.env.MPESA_B2C_SECURITY_CREDENTIAL ?? "";
    this.b2cResultUrl = options.b2cResultUrl ?? process.env.MPESA_B2C_RESULT_URL ?? "";
    this.b2cQueueTimeoutUrl = options.b2cQueueTimeoutUrl ?? process.env.MPESA_B2C_TIMEOUT_URL ?? "";
    this.retryOptions = options.retry ?? DEFAULT_RETRY_OPTIONS;

    const fetchCandidate = options.fetchImplementation ?? globalThis.fetch;
    if (!fetchCandidate) {
      throw new Error("A fetch implementation is required to interact with Daraja.");
    }
    this.fetchImpl = fetchCandidate.bind(globalThis);

    this.cipher =
      options.cipher ??
      new AesGcmCipher({
        key: options.cipherOptions?.key ?? process.env.MPESA_CREDENTIAL_KEY,
        fallbackSecret:
          options.cipherOptions?.fallbackSecret ??
          process.env.MPESA_CREDENTIAL_ENC_SECRET ??
          process.env.AUTH_SESSION_TOKEN_SECRET ??
          DEFAULT_CREDENTIAL_FALLBACK_SECRET,
        keyId: options.cipherOptions?.keyId ?? process.env.MPESA_CREDENTIAL_KEY_ID ?? DEFAULT_CREDENTIAL_KEY_ID
      });

    if (!this.consumerKey || !this.consumerSecret) {
      throw new Error("Daraja consumer credentials are required.");
    }

    if (!this.shortCode) {
      throw new Error("Daraja short code must be configured.");
    }

    if (!this.passkey) {
      throw new Error("Daraja passkey must be configured.");
    }

    if (!this.callbackUrl) {
      throw new Error("Daraja callback URL must be configured.");
    }

    this.encryptedCredentials = this.cipher.encrypt(`${this.consumerKey}:${this.consumerSecret}`);
    this.fallbackLogger = {
      info: (...args: unknown[]) => this.logger.log(...args),
      warn: (...args: unknown[]) => this.logger.warn(...args),
      error: (...args: unknown[]) => this.logger.error(...args),
      log: (...args: unknown[]) => this.logger.log(...args)
    };
  }

  async requestStkPush(request: DarajaStkPushRequest): Promise<DarajaStkPushResponse> {
    const requestLogger = this.resolveLogger(request.logger);

    const metadata = {
      requestId: request.requestId,
      amount: request.amount,
      shortCode: this.shortCode
    };

    requestLogger.log("Dispatching Daraja STK push", metadata);
    requestLogger.info({ event: "daraja.stkpush.start", ...metadata });

    const timestamp = formatTimestamp(new Date());
    const password = Buffer.from(`${this.shortCode}${this.passkey}${timestamp}`).toString("base64");

    const payload = {
      BusinessShortCode: this.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: request.amount,
      PartyA: request.phoneNumber,
      PartyB: this.shortCode,
      PhoneNumber: request.phoneNumber,
      CallBackURL: this.callbackUrl,
      AccountReference: request.accountReference,
      TransactionDesc: request.description
    };

    const response = await withRetries(async () => {
      const accessToken = await this.getAccessToken(requestLogger);

      const httpResponse = await this.fetchImpl(`${this.baseUrl}/mpesa/stkpush/v1/processrequest`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!httpResponse.ok) {
        const body = await httpResponse.text();
        requestLogger.warn({
          event: "daraja.stkpush.error",
          status: httpResponse.status,
          requestId: request.requestId,
          body
        });
        throw new Error(`Daraja STK push failed with status ${httpResponse.status}`);
      }

      return (await httpResponse.json()) as DarajaStkPushResponse;
    }, this.retryOptions);

    const completionMeta = {
      requestId: request.requestId,
      checkoutRequestId: response.CheckoutRequestID,
      merchantRequestId: response.MerchantRequestID
    };

    requestLogger.log("Daraja STK push accepted", completionMeta);
    requestLogger.info({ event: "daraja.stkpush.accepted", ...completionMeta });

    return response;
  }

  async sendB2CPayout(request: DarajaB2CPayoutRequest): Promise<DarajaB2CPayoutResponse> {
    const requestLogger = this.resolveLogger(request.logger);

    if (!this.b2cInitiatorName || !this.b2cSecurityCredential) {
      throw new Error("Daraja B2C credentials are not configured.");
    }

    if (!this.b2cResultUrl || !this.b2cQueueTimeoutUrl) {
      throw new Error("Daraja B2C callback URLs are not configured.");
    }

    const metadata = {
      requestId: request.requestId,
      amount: request.amount,
      shortCode: this.shortCode
    };

    requestLogger.info({ event: "daraja.b2c.start", ...metadata });

    const payload = {
      InitiatorName: this.b2cInitiatorName,
      SecurityCredential: this.b2cSecurityCredential,
      CommandID: "BusinessPayment",
      Amount: request.amount,
      PartyA: this.shortCode,
      PartyB: request.phoneNumber,
      Remarks: request.remarks ?? "Creator payout",
      QueueTimeOutURL: this.b2cQueueTimeoutUrl,
      ResultURL: this.b2cResultUrl,
      Occasion: request.occasion ?? undefined
    };

    const response = await withRetries(async () => {
      const accessToken = await this.getAccessToken(requestLogger);

      const httpResponse = await this.fetchImpl(`${this.baseUrl}/mpesa/b2c/v1/paymentrequest`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!httpResponse.ok) {
        const body = await httpResponse.text();
        requestLogger.warn({
          event: "daraja.b2c.error",
          status: httpResponse.status,
          requestId: request.requestId,
          body
        });
        throw new Error(`Daraja B2C payout failed with status ${httpResponse.status}`);
      }

      return (await httpResponse.json()) as DarajaB2CPayoutResponse;
    }, this.retryOptions);

    requestLogger.info({
      event: "daraja.b2c.dispatch",
      requestId: request.requestId,
      conversationId: response.ConversationID,
      originatorConversationId: response.OriginatorConversationID,
      responseCode: response.ResponseCode
    });

    return response;
  }

  private async getAccessToken(logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }) {
    if (this.accessTokenCache && this.accessTokenCache.expiresAt > Date.now()) {
      return this.accessTokenCache.token;
    }

    const token = await withRetries(async () => {
      const credentials = this.cipher.decrypt(this.encryptedCredentials);
      const basicAuth = Buffer.from(credentials, "utf8").toString("base64");

      const response = await this.fetchImpl(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${basicAuth}`
        }
      });

      if (!response.ok) {
        const body = await response.text();
        logger.warn({ event: "daraja.token.error", status: response.status, body });
        throw new Error(`Daraja token request failed with status ${response.status}`);
      }

      return (await response.json()) as AccessTokenResponse;
    }, this.retryOptions);

    const expiresInSeconds = Number(token.expires_in);
    const ttlMs = Number.isFinite(expiresInSeconds) ? expiresInSeconds * 1000 : 3600_000;
    this.accessTokenCache = {
      token: token.access_token,
      expiresAt: Date.now() + ttlMs - 60_000
    };

    logger.info({ event: "daraja.token.issued", expiresIn: ttlMs });

    return token.access_token;
  }

  private resolveLogger(candidate?: LoggerCandidate) {
    if (!candidate) {
      return this.fallbackLogger;
    }

    if (candidate instanceof Logger) {
      return {
        info: candidate.log.bind(candidate),
        warn: candidate.warn.bind(candidate),
        error: candidate.error.bind(candidate),
        log: candidate.log.bind(candidate)
      };
    }

    return {
      info: candidate.info?.bind(candidate) ?? this.fallbackLogger.info,
      warn: candidate.warn?.bind(candidate) ?? this.fallbackLogger.warn,
      error: candidate.error?.bind(candidate) ?? this.fallbackLogger.error,
      log: candidate.log?.bind(candidate) ?? this.fallbackLogger.log
    };
  }
}
