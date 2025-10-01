import { Buffer } from "node:buffer";
import {
  DecryptCommand,
  KMSClient,
  type DecryptCommandInput,
  type DecryptCommandOutput
} from "@aws-sdk/client-kms";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
  type GetSecretValueCommandInput,
  type GetSecretValueCommandOutput
} from "@aws-sdk/client-secrets-manager";

const decodeBase64 = (value: string): Buffer => {
  try {
    return Buffer.from(value, "base64");
  } catch (error) {
    throw new Error(`Failed to decode base64 value: ${(error as Error).message}`);
  }
};

export interface TikTokTokenKeyMaterial {
  key: string;
  keyId: string;
}

export interface TikTokManagedKeyProviderOptions {
  /**
   * Explicit base64 encoded data key. Useful for tests or environments that
   * do not rely on AWS managed material.
   */
  key?: string;
  /**
   * Override for the key identifier. Defaults to `TIKTOK_TOKEN_ENC_KEY_ID`.
   */
  keyId?: string;
  /**
   * Override for the Secrets Manager secret identifier. Defaults to
   * `TIKTOK_TOKEN_DATA_KEY_SECRET_ARN`.
   */
  secretId?: string;
  /**
   * Optional Secrets Manager client. When omitted a new client is created.
   */
  secretsManager?: SecretsManagerClient;
  /**
   * Optional KMS client. When omitted a new client is created.
   */
  kms?: KMSClient;
}

export class TikTokManagedKeyProvider {
  private cached?: TikTokTokenKeyMaterial;

  private inflight?: Promise<TikTokTokenKeyMaterial>;

  constructor(private readonly options: TikTokManagedKeyProviderOptions = {}) {}

  async getKeyMaterial(): Promise<TikTokTokenKeyMaterial> {
    if (this.cached) {
      return this.cached;
    }

    if (this.inflight) {
      return this.inflight;
    }

    this.inflight = this.loadKeyMaterial();

    try {
      this.cached = await this.inflight;
      return this.cached;
    } finally {
      this.inflight = undefined;
    }
  }

  private async loadKeyMaterial(): Promise<TikTokTokenKeyMaterial> {
    const keyId = this.options.keyId ?? process.env.TIKTOK_TOKEN_ENC_KEY_ID;

    if (!keyId) {
      throw new Error("TIKTOK_TOKEN_ENC_KEY_ID must be configured.");
    }

    const explicitKey = this.options.key ?? process.env.TIKTOK_TOKEN_ENC_KEY;
    if (explicitKey) {
      const keyBuffer = decodeBase64(explicitKey);
      if (keyBuffer.length !== 32) {
        throw new Error("TikTok token data key must be 32 bytes when decoded from base64.");
      }

      return { key: explicitKey, keyId };
    }

    const secretId = this.options.secretId ?? process.env.TIKTOK_TOKEN_DATA_KEY_SECRET_ARN;

    if (!secretId) {
      throw new Error("TIKTOK_TOKEN_DATA_KEY_SECRET_ARN must be configured when using managed key material.");
    }

    const secretsManager = this.options.secretsManager ?? new SecretsManagerClient({});
    const secretCommandInput: GetSecretValueCommandInput = { SecretId: secretId };
    const secret = await secretsManager.send(new GetSecretValueCommand(secretCommandInput));
    const ciphertextBase64 = this.extractCiphertext(secret);

    if (!ciphertextBase64) {
      throw new Error("TikTok token data key secret did not contain ciphertext.");
    }

    const ciphertext = decodeBase64(ciphertextBase64);
    const kms = this.options.kms ?? new KMSClient({});
    const decryptInput: DecryptCommandInput = { CiphertextBlob: ciphertext };
    const decrypted = await kms.send(new DecryptCommand(decryptInput));
    const plaintext = this.extractPlaintext(decrypted);

    if (!plaintext) {
      throw new Error("KMS decrypt response did not include plaintext data.");
    }

    if (plaintext.length !== 32) {
      throw new Error("TikTok token data key must be 32 bytes after decrypting.");
    }

    return { key: plaintext.toString("base64"), keyId };
  }

  private extractCiphertext(secret: GetSecretValueCommandOutput): string | undefined {
    if (typeof secret.SecretString === "string" && secret.SecretString.trim().length > 0) {
      return secret.SecretString.trim();
    }

    if (secret.SecretBinary instanceof Uint8Array) {
      return Buffer.from(secret.SecretBinary).toString("base64");
    }

    if (Array.isArray(secret.SecretBinary)) {
      return Buffer.from(secret.SecretBinary).toString("base64");
    }

    return undefined;
  }

  private extractPlaintext(result: DecryptCommandOutput): Buffer | undefined {
    if (result.Plaintext instanceof Uint8Array) {
      return Buffer.from(result.Plaintext);
    }

    if (Array.isArray(result.Plaintext)) {
      return Buffer.from(result.Plaintext);
    }

    if (typeof result.Plaintext === "string" && result.Plaintext.length > 0) {
      return Buffer.from(result.Plaintext, "base64");
    }

    return undefined;
  }
}

