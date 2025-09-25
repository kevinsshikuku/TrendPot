import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface TikTokEncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface TikTokTokenCipherOptions {
  /**
   * Base64 encoded 32-byte key. When omitted we derive a deterministic
   * development key from the session token secret to keep local bootstrap
   * simple while still exercising the encryption path.
   */
  key?: string;
  /**
   * Optional secret used to derive a key when `key` is not supplied.
   */
  fallbackSecret?: string;
  /**
   * Identifier persisted alongside encrypted payloads so that rotation can
   * verify callers are using a compatible key at decrypt time.
   */
  keyId?: string;
}

const DEFAULT_SESSION_SECRET = "trendpot-dev-session-token";
const DEFAULT_KEY_ID = "local-dev";

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
    const fallbackSecret = options.fallbackSecret ?? process.env.AUTH_SESSION_TOKEN_SECRET ?? DEFAULT_SESSION_SECRET;
    this.keyId = options.keyId ?? process.env.TIKTOK_TOKEN_ENC_KEY_ID ?? DEFAULT_KEY_ID;

    if (explicitKey) {
      const buffer = decodeBase64(explicitKey);
      if (buffer.length !== 32) {
        throw new Error("TikTok token encryption key must be 32 bytes when decoded from base64.");
      }
      this.key = buffer;
      return;
    }

    this.key = createHash("sha256").update(fallbackSecret).digest();
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

