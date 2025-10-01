import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export interface AesGcmCipherOptions {
  /**
   * Base64 encoded 32-byte key. When omitted a deterministic key is derived
   * from the fallback secret to keep local development simple while
   * preserving realistic encryption flows.
   */
  key?: string;
  /**
   * Optional secret used to derive a key when an explicit key is not
   * supplied. Either `key` or `fallbackSecret` must be provided.
   */
  fallbackSecret?: string;
  /**
   * Identifier persisted alongside encrypted payloads so that key rotation
   * can validate compatibility at decrypt time.
   */
  keyId?: string;
}

const DEFAULT_KEY_ID = "default";
const DEFAULT_IV_LENGTH = 12;

const decodeBase64 = (value: string): Buffer => {
  try {
    return Buffer.from(value, "base64");
  } catch (error) {
    throw new Error(`Failed to decode base64 value: ${(error as Error).message}`);
  }
};

export class AesGcmCipher {
  private readonly key: Buffer;

  readonly keyId: string;

  constructor(options: AesGcmCipherOptions = {}) {
    const explicitKey = options.key;
    const fallbackSecret = options.fallbackSecret;

    this.keyId = options.keyId ?? DEFAULT_KEY_ID;

    if (explicitKey) {
      const buffer = decodeBase64(explicitKey);
      if (buffer.length !== 32) {
        throw new Error("AES-GCM encryption key must be 32 bytes when decoded from base64.");
      }
      this.key = buffer;
      return;
    }

    if (!fallbackSecret) {
      throw new Error("Either an explicit key or fallback secret must be provided to initialise the cipher.");
    }

    this.key = createHash("sha256").update(fallbackSecret).digest();
  }

  encrypt(plaintext: string): EncryptedSecret {
    const iv = randomBytes(DEFAULT_IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64")
    };
  }

  decrypt(secret: EncryptedSecret, options: { keyId?: string } = {}): string {
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
