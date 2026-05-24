import { Redis } from "@upstash/redis";
import type { StreamResponse } from "./types";

const CACHE_TTL_SECONDS = 45 * 60;

let redis: Redis | null = null;

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!redis) {
    redis = new Redis({ url, token });
  }
  return redis;
}

export function cacheKey(
  type: "movie" | "tv",
  tmdbId: string,
  season?: string,
  episode?: string,
): string {
  if (type === "movie") return `stream:movie:${tmdbId}`;
  return `stream:tv:${tmdbId}:${season}:${episode}`;
}

export async function getCachedStream(
  key: string,
): Promise<StreamResponse | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    return await client.get<StreamResponse>(key);
  } catch {
    return null;
  }
}

export async function setCachedStream(
  key: string,
  value: StreamResponse,
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.set(key, value, { ex: CACHE_TTL_SECONDS });
  } catch {
    // Cache failures should not break playback.
  }
}
