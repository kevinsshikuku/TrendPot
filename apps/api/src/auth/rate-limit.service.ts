import { Injectable } from "@nestjs/common";
import type { RateLimitOptions } from "./auth.decorators";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class RateLimitService {
  constructor(private readonly redisService: RedisService) {}

  async consume(key: string, options: RateLimitOptions): Promise<{ allowed: boolean; retryAt: number }> {
    const redisKey = `ratelimit:${key}`;
    const client = this.redisService.getClient();

    const now = Date.now();
    const ttlMs = options.windowMs;

    const pipeline = client.multi();
    pipeline.incr(redisKey);
    pipeline.pexpire(redisKey, ttlMs, "NX");
    pipeline.pttl(redisKey);

    const results = await pipeline.exec();

    const [, countResult] = results?.[0] ?? [];
    const [, ttlResult] = results?.[2] ?? [];

    const count = Number(countResult ?? 0);
    let ttl = Number(ttlResult ?? ttlMs);
    if (ttl <= 0) {
      await client.pexpire(redisKey, ttlMs);
      ttl = ttlMs;
    }

    const retryAt = now + ttl;

    if (count > options.max) {
      return { allowed: false, retryAt };
    }

    return { allowed: true, retryAt };
  }
}
