export interface RetryOptions {
  retries?: number;
  delayMs?: number;
}

export const withRetries = async <T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> => {
  const { retries = 0, delayMs = 250 } = options;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }

      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

export * from "./tiktok-token-crypto";
