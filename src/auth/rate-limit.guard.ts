import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import { Redis } from 'ioredis';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly rateLimiter: RateLimiterMemory | RateLimiterRedis;

  constructor(private configService: ConfigService) {
    const redisUrl = this.configService.get('REDIS_URL');
    const points = this.configService.get<number>('RATE_LIMIT_POINTS', 5);
    const duration = this.configService.get<number>('RATE_LIMIT_DURATION', 60);

    if (redisUrl) {
      const redis = new Redis(redisUrl);
      this.rateLimiter = new RateLimiterRedis({
        storeClient: redis,
        points,
        duration,
        keyPrefix: 'rate-limit',
      });
    } else {
      this.rateLimiter = new RateLimiterMemory({
        points,
        duration,
      });
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.ip;
    const key = `ip:${ip}`;

    try {
      const result = await this.rateLimiter.consume(key);
      request.res.set({
        'X-RateLimit-Limit': this.rateLimiter.points,
        'X-RateLimit-Remaining': result.remainingPoints,
        'X-RateLimit-Reset': Math.ceil(result.msBeforeNext / 1000),
      });
      return true;
    } catch (error) {
      this.logger.warn(`Rate limit exceeded for key: ${key}`);
      request.res.set({
        'Retry-After': Math.ceil(error.msBeforeNext / 1000),
      });
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}