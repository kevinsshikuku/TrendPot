import { AesGcmCipher, type AesGcmCipherOptions, type EncryptedSecret } from "./aes-gcm-cipher";

export interface TikTokEncryptedSecret extends EncryptedSecret {}

export interface TikTokTokenCipherOptions extends AesGcmCipherOptions {}

const DEFAULT_SESSION_SECRET = "trendpot-dev-session-token";
const DEFAULT_KEY_ID = "local-dev";

export class TikTokTokenCipher extends AesGcmCipher {
  constructor(options: TikTokTokenCipherOptions = {}) {
    const explicitKey = options.key ?? process.env.TIKTOK_TOKEN_ENC_KEY;
    const fallbackSecret = options.fallbackSecret ?? process.env.AUTH_SESSION_TOKEN_SECRET ?? DEFAULT_SESSION_SECRET;
    const keyId = options.keyId ?? process.env.TIKTOK_TOKEN_ENC_KEY_ID ?? DEFAULT_KEY_ID;

    super({ key: explicitKey, fallbackSecret, keyId });
  }

  encrypt(plaintext: string): TikTokEncryptedSecret {
    return super.encrypt(plaintext);
  }

  decrypt(secret: TikTokEncryptedSecret, options: { keyId?: string } = {}): string {
    return super.decrypt(secret, options);
  }
}

export const mapAccountTokenToEncryptedSecret = (
  token: { ciphertext: string; iv: string; authTag?: string; tag?: string }
): TikTokEncryptedSecret => ({
  ciphertext: token.ciphertext,
  iv: token.iv,
  authTag: token.authTag ?? token.tag ?? ""
});

