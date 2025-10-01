const { createCipheriv, createDecipheriv, randomBytes } = require("node:crypto");

const decodeBase64 = (value) => {
  try {
    return Buffer.from(value, "base64");
  } catch (error) {
    throw new Error(`Failed to decode base64 value: ${error.message}`);
  }
};

class TikTokTokenCipher {
  constructor(options = {}) {
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

  encrypt(plaintext) {
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

  decrypt(secret, options = {}) {
    if (options.keyId && options.keyId !== this.keyId) {
      throw new Error("Encrypted payload was produced with a different key.");
    }

    const iv = Buffer.from(secret.iv, "base64");
    const ciphertext = Buffer.from(secret.ciphertext, "base64");
    const authTag = Buffer.from(secret.authTag ?? secret.tag ?? "", "base64");

    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    if (authTag.length > 0) {
      decipher.setAuthTag(authTag);
    }

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  }
}

const mapAccountTokenToEncryptedSecret = (token) => ({
  ciphertext: token.ciphertext,
  iv: token.iv,
  authTag: token.authTag ?? token.tag ?? ""
});

class TikTokManagedKeyProvider {
  constructor(options = {}) {
    this.options = options;
    this.cached = null;
    this.inflight = null;
  }

  async getKeyMaterial() {
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
      this.inflight = null;
    }
  }

  async loadKeyMaterial() {
    const keyId = this.options.keyId ?? process.env.TIKTOK_TOKEN_ENC_KEY_ID;
    if (!keyId) {
      throw new Error("TIKTOK_TOKEN_ENC_KEY_ID must be configured.");
    }

    const explicitKey = this.options.key ?? process.env.TIKTOK_TOKEN_ENC_KEY;
    if (explicitKey) {
      const buffer = decodeBase64(explicitKey);
      if (buffer.length !== 32) {
        throw new Error("TikTok token data key must be 32 bytes when decoded from base64.");
      }

      return { key: explicitKey, keyId };
    }

    const secretId = this.options.secretId ?? process.env.TIKTOK_TOKEN_DATA_KEY_SECRET_ARN;
    if (!secretId) {
      throw new Error("TIKTOK_TOKEN_DATA_KEY_SECRET_ARN must be configured when using managed key material.");
    }

    const secretsManager = this.options.secretsManager;
    if (!secretsManager) {
      throw new Error("A Secrets Manager client must be supplied when explicit key material is not configured.");
    }

    const secret = await secretsManager.send({ input: { SecretId: secretId } });
    let ciphertextBase64;

    if (typeof secret.SecretString === "string" && secret.SecretString.trim().length > 0) {
      ciphertextBase64 = secret.SecretString.trim();
    } else if (secret.SecretBinary) {
      ciphertextBase64 = Buffer.from(secret.SecretBinary).toString("base64");
    }

    if (!ciphertextBase64) {
      throw new Error("TikTok token data key secret did not contain ciphertext.");
    }

    const ciphertext = decodeBase64(ciphertextBase64);

    const kms = this.options.kms;
    if (!kms) {
      throw new Error("A KMS client must be supplied when explicit key material is not configured.");
    }

    const decrypted = await kms.send({ input: { CiphertextBlob: ciphertext } });
    let plaintext;

    if (decrypted.Plaintext instanceof Uint8Array || Buffer.isBuffer(decrypted.Plaintext)) {
      plaintext = Buffer.from(decrypted.Plaintext);
    } else if (Array.isArray(decrypted.Plaintext)) {
      plaintext = Buffer.from(decrypted.Plaintext);
    } else if (typeof decrypted.Plaintext === "string" && decrypted.Plaintext.length > 0) {
      plaintext = Buffer.from(decrypted.Plaintext, "base64");
    }

    if (!plaintext) {
      throw new Error("KMS decrypt response did not include plaintext data.");
    }

    if (plaintext.length !== 32) {
      throw new Error("TikTok token data key must be 32 bytes after decrypting.");
    }

    return { key: plaintext.toString("base64"), keyId };
  }
}

module.exports = { TikTokTokenCipher, TikTokManagedKeyProvider, mapAccountTokenToEncryptedSecret };
