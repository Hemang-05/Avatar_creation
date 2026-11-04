import { Article, ExtractionMethod } from "@/types/article";
import { ResearchResult } from "@/types/research";
import { NewsScript } from "@/types/script";
import { AvatarMetadata } from "@/types/avatar";
import { VideoMetadata } from "@/types/chat";
import { validateArticleUrl } from "@/lib/urlValidation";

export const PIPELINE_CACHE_STORAGE_KEY = "newsai_studio_url_cache_v1";
export const MAX_CACHED_URLS = 8;

export interface CachedAudioData {
  /**
   * Base64-encoded MP3 payload (without data: prefix) so a fresh Blob/ObjectURL
   * can be reconstructed across browser reloads and passed to Phase 6 if needed.
   */
  audioBase64?: string;
  mimeType: string;
  audioId?: string;
  serverAudioUrl?: string;
  provider?: string;
  modelId?: string;
  scriptTitle?: string;
  wordCount?: number;
  estimatedDurationSeconds?: number;
  generatedAt?: string;
}

export interface CachedUrlPipelineEntry {
  url: string;
  domain?: string;
  cachedAt: string;
  updatedAt: string;
  article?: Article;
  extractionMethod?: ExtractionMethod;
  research?: ResearchResult;
  script?: NewsScript;
  audio?: CachedAudioData;
  avatar?: AvatarMetadata;
  video?: VideoMetadata;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getBrowserStorage(customStorage?: StorageLike): StorageLike | null {
  if (customStorage) return customStorage;
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

/**
 * Normalizes an article URL into a canonical cache key so minor differences
 * (whitespace, trailing slash, uppercase hostname) map to the same cache entry.
 */
export function normalizeCacheKeyUrl(rawUrl: string): string {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) return "";

  const validated = validateArticleUrl(trimmed);
  const candidate = validated.normalizedUrl || trimmed;

  try {
    const parsed = new URL(candidate);
    parsed.hash = "";
    const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${normalizedPath}${parsed.search}`;
  } catch {
    return candidate.replace(/\/+$/, "");
  }
}

function readCacheMap(
  storage?: StorageLike
): Record<string, CachedUrlPipelineEntry> {
  const store = getBrowserStorage(storage);
  if (!store) return {};

  try {
    const raw = store.getItem(PIPELINE_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, CachedUrlPipelineEntry>;
  } catch {
    return {};
  }
}

function writeCacheMap(
  map: Record<string, CachedUrlPipelineEntry>,
  storage?: StorageLike
): void {
  const store = getBrowserStorage(storage);
  if (!store) return;

  // Keep only the most recently updated MAX_CACHED_URLS entries
  const entries = Object.entries(map).sort(([, a], [, b]) =>
    (b.updatedAt || "").localeCompare(a.updatedAt || "")
  );
  const trimmedEntries = entries.slice(0, MAX_CACHED_URLS);
  const nextMap = Object.fromEntries(trimmedEntries);

  try {
    store.setItem(PIPELINE_CACHE_STORAGE_KEY, JSON.stringify(nextMap));
  } catch {
    // If QuotaExceededError occurs, strip heavy audioBase64 from older entries first
    try {
      const lighterEntries = trimmedEntries.map(([key, val], idx) => {
        if (idx === 0) return [key, val] as const;
        if (val.audio?.audioBase64) {
          return [
            key,
            {
              ...val,
              audio: {
                ...val.audio,
                audioBase64: undefined,
              },
            },
          ] as const;
        }
        return [key, val] as const;
      });
      store.setItem(
        PIPELINE_CACHE_STORAGE_KEY,
        JSON.stringify(Object.fromEntries(lighterEntries))
      );
    } catch {
      // Final fallback: keep only the newest entry without audioBase64 if storage is still full
      if (trimmedEntries.length > 0) {
        const [latestKey, latestVal] = trimmedEntries[0];
        try {
          store.setItem(
            PIPELINE_CACHE_STORAGE_KEY,
            JSON.stringify({
              [latestKey]: {
                ...latestVal,
                audio: latestVal.audio
                  ? { ...latestVal.audio, audioBase64: undefined }
                  : undefined,
              },
            })
          );
        } catch {
          // Ignore if localStorage is completely disabled/full
        }
      }
    }
  }
}

/**
 * Retrieves a cached pipeline entry for a given URL from browser localStorage.
 */
export function getCachedUrlPipeline(
  url: string,
  storage?: StorageLike
): CachedUrlPipelineEntry | null {
  const key = normalizeCacheKeyUrl(url);
  if (!key) return null;

  const map = readCacheMap(storage);
  return map[key] || null;
}

/**
 * Upserts partial or complete pipeline stage data for a given URL into browser localStorage.
 */
export function saveCachedUrlPipeline(
  url: string,
  patch: Partial<Omit<CachedUrlPipelineEntry, "url" | "cachedAt" | "updatedAt">>,
  storage?: StorageLike
): CachedUrlPipelineEntry | null {
  const key = normalizeCacheKeyUrl(url);
  if (!key) return null;

  const map = readCacheMap(storage);
  const now = new Date().toISOString();
  const existing = map[key];

  const updated: CachedUrlPipelineEntry = {
    url: key,
    domain: patch.domain ?? existing?.domain,
    cachedAt: existing?.cachedAt ?? now,
    updatedAt: now,
    article: patch.article ?? existing?.article,
    extractionMethod: patch.extractionMethod ?? existing?.extractionMethod,
    research: patch.research ?? existing?.research,
    script: patch.script ?? existing?.script,
    audio: patch.audio ?? existing?.audio,
    avatar: patch.avatar ?? existing?.avatar,
  };

  map[key] = updated;
  writeCacheMap(map, storage);
  return updated;
}

/**
 * Removes a specific URL from the browser localStorage cache.
 */
export function removeCachedUrlPipeline(
  url: string,
  storage?: StorageLike
): void {
  const key = normalizeCacheKeyUrl(url);
  if (!key) return;

  const map = readCacheMap(storage);
  if (key in map) {
    delete map[key];
    writeCacheMap(map, storage);
  }
}

/**
 * Clears all cached URL pipeline entries from browser localStorage.
 */
export function clearAllCachedUrlPipelines(storage?: StorageLike): void {
  const store = getBrowserStorage(storage);
  if (!store) return;
  try {
    store.removeItem(PIPELINE_CACHE_STORAGE_KEY);
  } catch {
    // Ignore storage removal errors
  }
}

/**
 * Converts a browser Blob into a Base64 string (without the data:...;base64, prefix)
 * so synthesized TTS audio can be persisted in localStorage.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  return Buffer.from(arrayBuffer).toString("base64");
}

/**
 * Reconstructs a browser Blob from a Base64 string and MIME type.
 */
export function base64ToBlob(base64: string, mimeType = "audio/mpeg"): Blob {
  const clean = base64.replace(/^data:[^;]+;base64,/, "").trim();
  if (typeof atob === "function") {
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }
  const buf = Buffer.from(clean, "base64");
  return new Blob([new Uint8Array(buf)], { type: mimeType });
}

