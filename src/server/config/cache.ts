import NodeCache from 'node-cache';

export const queryCache = new NodeCache({ stdTTL: 300 });
export const swrMemoryCache = new NodeCache({ stdTTL: 1800 });
export const inFlightRequests = new Map<string, Promise<any>>();

export interface SwrEntry<T = any> {
  data: T;
  freshUntil: number;
}

export function cacheGet<T = any>(key: string): Promise<T | null> {
  return Promise.resolve((queryCache.get(key) as T) || null);
}

export function cacheSet(key: string, val: any, ttlSeconds = 300): Promise<void> {
  queryCache.set(key, val, ttlSeconds);
  swrMemoryCache.set(
    key,
    { data: val, freshUntil: Date.now() + ttlSeconds * 1000 } as SwrEntry,
    Math.max(ttlSeconds * 6, 900)
  );
  return Promise.resolve();
}

export function swrGet<T = any>(key: string): SwrEntry<T> | undefined {
  return swrMemoryCache.get<SwrEntry<T>>(key);
}

export function swrSet<T = any>(
  key: string,
  data: T,
  ttlSeconds: number
): void {
  swrMemoryCache.set(
    key,
    { data, freshUntil: Date.now() + ttlSeconds * 1000 } as SwrEntry<T>,
    Math.max(ttlSeconds * 6, 900)
  );
}

export function swrDelete(key: string): void {
  swrMemoryCache.del(key);
}

export function inFlightGet(key: string): Promise<any> | undefined {
  return inFlightRequests.get(key);
}

export function inFlightSet(key: string, promise: Promise<any>): void {
  inFlightRequests.set(key, promise);
}

export function inFlightDelete(key: string): void {
  inFlightRequests.delete(key);
}

export function cacheFlushAll(): void {
  queryCache.flushAll();
}
