import { Redis } from 'ioredis';
import { env } from './env';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!redisClient && env.REDIS_URL) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      tls: env.REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
    });
    redisClient.on('connect', () => console.log('🚀 Conectado a Azure Cache for Redis'));
    redisClient.on('error', (err) => console.warn('⚠️ Aviso Redis (usando fallback RAM):', err.message));
  }
  return redisClient;
}

export function isRedisReady(): boolean {
  return redisClient?.status === 'ready';
}

export async function quitRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      // Ignorar errores al cerrar
    }
    redisClient = null;
  }
}
