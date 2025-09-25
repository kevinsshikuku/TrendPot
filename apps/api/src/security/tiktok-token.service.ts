import { Injectable } from "@nestjs/common";
import {
  TikTokEncryptedSecret,
  TikTokTokenCipher,
  mapAccountTokenToEncryptedSecret
} from "@trendpot/utils";

@Injectable()
export class TikTokTokenService {
  private readonly cipher = new TikTokTokenCipher();

  get keyId(): string {
    return this.cipher.keyId;
  }

  encrypt(plaintext: string): TikTokEncryptedSecret {
    return this.cipher.encrypt(plaintext);
  }

  decrypt(secret: TikTokEncryptedSecret, expectedKeyId?: string): string {
    return this.cipher.decrypt(secret, { keyId: expectedKeyId });
  }

  decryptAccountToken(
    token: { ciphertext: string; iv: string; authTag?: string; tag?: string },
    expectedKeyId?: string
  ): string {
    return this.decrypt(mapAccountTokenToEncryptedSecret(token), expectedKeyId);
  }
}

