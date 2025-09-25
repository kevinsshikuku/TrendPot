import { Injectable } from "@nestjs/common";
import type { RateLimitOptions } from "./auth.decorators";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, RateLimitBucket>();

  consume(key: string, options: RateLimitOptions): { allowed: boolean; retryAt: number } {
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return { allowed: true, retryAt: now + options.windowMs };
    }

    if (existing.count >= options.max) {
      return { allowed: false, retryAt: existing.resetAt };
    }

    existing.count += 1;
    this.buckets.set(key, existing);
    return { allowed: true, retryAt: existing.resetAt };
  }
}
