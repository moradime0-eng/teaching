import Redis from 'ioredis';

class RedisClient {
  private static instance: RedisClient;
  public client: Redis | null = null;
  public subscriber: Redis | null = null;
  public publisher: Redis | null = null;
  public isConnected: boolean = false;
  private warnedOnce: boolean = false;

  private constructor() {
    const config = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null, // غیرفعال کردن تلاش مجدد اسپمی در صورت قطع بودن
    };

    try {
      this.client = new Redis(config);
      this.subscriber = new Redis(config);
      this.publisher = new Redis(config);

      const attachListeners = (instance: Redis, name: string) => {
        instance.on('connect', () => {
          this.isConnected = true;
          console.log(`✅ Redis ${name} Connected`);
        });

        instance.on('error', (err: any) => {
          this.isConnected = false;
          if (!this.warnedOnce) {
            console.warn(
              '⚠️ [Redis] سرویس ریدیس در دسترس نیست. سیستم بدون کش موقت به کار خود ادامه می‌دهد.',
            );
            this.warnedOnce = true;
          }
        });
      };

      attachListeners(this.client, 'Client');
      attachListeners(this.subscriber, 'Subscriber');
      attachListeners(this.publisher, 'Publisher');

      // تلاش برای اتصال اولیه
      this.client.connect().catch(() => {});
      this.subscriber.connect().catch(() => {});
      this.publisher.connect().catch(() => {});
    } catch {
      this.isConnected = false;
    }
  }

  public static getInstance(): RedisClient {
    if (!RedisClient.instance) {
      RedisClient.instance = new RedisClient();
    }
    return RedisClient.instance;
  }

  public async get(key: string): Promise<string | null> {
    if (!this.isConnected || !this.client) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected || !this.client) return;
    try {
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch {
      // نادیده گرفتن خطا در صورت قطعی
    }
  }

  public async del(key: string): Promise<void> {
    if (!this.isConnected || !this.client) return;
    try {
      await this.client.del(key);
    } catch {}
  }

  public async delPattern(pattern: string): Promise<void> {
    if (!this.isConnected || !this.client) return;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch {}
  }

  public async disconnect(): Promise<void> {
    if (this.client) await this.client.quit().catch(() => {});
    if (this.subscriber) await this.subscriber.quit().catch(() => {});
    if (this.publisher) await this.publisher.quit().catch(() => {});
  }
}

export default RedisClient.getInstance();
