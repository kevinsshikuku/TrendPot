import type { Provider } from "@nestjs/common";
import { TikTokManagedKeyProvider, TikTokTokenCipher } from "@trendpot/utils";
import { apiLogger } from "../observability/logger";

export const TikTokTokenCipherProvider: Provider = {
  provide: TikTokTokenCipher,
  useFactory: async () => {
    const provider = new TikTokManagedKeyProvider();
    const material = await provider.getKeyMaterial();

    apiLogger.info(
      { event: "tiktok.token.key.loaded", keyId: material.keyId },
      "Loaded TikTok token encryption key material"
    );

    return new TikTokTokenCipher({ key: material.key, keyId: material.keyId });
  }
};

