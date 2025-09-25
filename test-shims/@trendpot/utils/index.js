const { createCipheriv, createDecipheriv, createHash, randomBytes } = require("node:crypto");

class TikTokTokenCipher {
  constructor(options = {}) {
    const explicitKey = options.key ?? process.env.TIKTOK_TOKEN_ENC_KEY;
    const fallbackSecret = options.fallbackSecret ?? process.env.AUTH_SESSION_TOKEN_SECRET ?? "trendpot-dev-session-token";
    this.keyId = options.keyId ?? process.env.TIKTOK_TOKEN_ENC_KEY_ID ?? "local-dev";

    if (explicitKey) {
      const buffer = Buffer.from(explicitKey, "base64");
      if (buffer.length !== 32) {
        throw new Error("TikTok token encryption key must be 32 bytes when decoded from base64.");
      }
      this.key = buffer;
    } else {
      this.key = createHash("sha256").update(fallbackSecret).digest();
    }
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

module.exports = { TikTokTokenCipher, mapAccountTokenToEncryptedSecret };
