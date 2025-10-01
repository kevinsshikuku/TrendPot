import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface TikTokEncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface TikTokTokenCipherOptions {
  /**
   * Base64 encoded 32-byte key. When omitted we fall back to the
   * `TIKTOK_TOKEN_ENC_KEY` environment variable so production workloads can
   * rely on managed bootstrap.
   */
  key?: string;
  /**
   * Identifier persisted alongside encrypted payloads so that rotation can
   * verify callers are using a compatible key at decrypt time.
   */
  keyId?: string;
}

const decodeBase64 = (value: string): Buffer => {
  try {
    return Buffer.from(value, "base64");
  } catch (error) {
    throw new Error(`Failed to decode base64 value: ${(error as Error).message}`);
  }
};

export class TikTokTokenCipher {
  private readonly key: Buffer;

  readonly keyId: string;

  constructor(options: TikTokTokenCipherOptions = {}) {
    const explicitKey = options.key ?? process.env.TIKTOK_TOKEN_ENC_KEY;
    const keyId = options.keyId ?? process.env.TIKTOK_TOKEN_ENC_KEY_ID;

    if (!explicitKey) {
      throw new Error("TikTok token encryption key must be provided via options.key or TIKTOK_TOKEN_ENC_KEY.");
    }

    if (!keyId) {
      throw new Error("TikTok token encryption key ID must be provided via options.keyId or TIKTOK_TOKEN_ENC_KEY_ID.");
    }

    const buffer = decodeBase64(explicitKey);
    if (buffer.length !== 32) {
      throw new Error("TikTok token encryption key must be 32 bytes when decoded from base64.");
    }

    this.key = buffer;
    this.keyId = keyId;
  }

  encrypt(plaintext: string): TikTokEncryptedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64")
    };
  }

  decrypt(secret: TikTokEncryptedSecret, options: { keyId?: string } = {}): string {
    if (options.keyId && options.keyId !== this.keyId) {
      throw new Error("Encrypted payload was produced with a different key.");
    }

    const iv = decodeBase64(secret.iv);
    const ciphertext = decodeBase64(secret.ciphertext);
    const authTag = decodeBase64(secret.authTag);

    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  }
}

export const mapAccountTokenToEncryptedSecret = (
  token: { ciphertext: string; iv: string; authTag?: string; tag?: string }
): TikTokEncryptedSecret => ({
  ciphertext: token.ciphertext,
  iv: token.iv,
  authTag: token.authTag ?? token.tag ?? ""
});

