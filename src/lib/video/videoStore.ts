import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface StoredVideoEntry {
  id: string;
  filePath: string;
  durationSeconds: number;
  width: number;
  height: number;
  createdAt: number;
  expiresAt: number;
}

const TEMP_VIDEO_DIR = path.join(os.tmpdir(), "newsai_studio_videos");
const VIDEO_TTL_MS = 1000 * 60 * 60; // 1 hour
const MAX_STORED_VIDEOS = 50;

declare global {
  var __newsAiVideoStore: Map<string, StoredVideoEntry> | undefined;
}

function getVideoStore(): Map<string, StoredVideoEntry> {
  if (!globalThis.__newsAiVideoStore) {
    globalThis.__newsAiVideoStore = new Map<string, StoredVideoEntry>();
  }
  return globalThis.__newsAiVideoStore;
}

export function ensureVideoDir(): string {
  if (!fs.existsSync(TEMP_VIDEO_DIR)) {
    fs.mkdirSync(TEMP_VIDEO_DIR, { recursive: true });
  }
  return TEMP_VIDEO_DIR;
}

export function pruneExpiredVideos(now = Date.now()): void {
  const store = getVideoStore();
  for (const [id, entry] of store.entries()) {
    if (entry.expiresAt <= now) {
      try {
        if (fs.existsSync(entry.filePath)) {
          fs.unlinkSync(entry.filePath);
        }
      } catch {
        // Ignore deletion errors on expired cleanup
      }
      store.delete(id);
    }
  }

  while (store.size >= MAX_STORED_VIDEOS) {
    const oldestKey = store.keys().next().value;
    if (!oldestKey) break;
    const oldest = store.get(oldestKey);
    if (oldest) {
      try {
        if (fs.existsSync(oldest.filePath)) {
          fs.unlinkSync(oldest.filePath);
        }
      } catch {
        // Ignore deletion error
      }
    }
    store.delete(oldestKey);
  }
}

export function registerVideo(
  sourceFilePath: string,
  durationSeconds: number,
  width = 1920,
  height = 1080,
  ttlMs = VIDEO_TTL_MS
): StoredVideoEntry {
  ensureVideoDir();
  pruneExpiredVideos();

  const id = `vid_${crypto.randomUUID().replace(/-/g, "")}`;
  const targetPath = path.join(TEMP_VIDEO_DIR, `${id}.mp4`);

  // Move or copy the generated file into the persistent temporary video directory
  fs.copyFileSync(sourceFilePath, targetPath);

  const now = Date.now();
  const entry: StoredVideoEntry = {
    id,
    filePath: targetPath,
    durationSeconds,
    width,
    height,
    createdAt: now,
    expiresAt: now + ttlMs,
  };

  getVideoStore().set(id, entry);
  return entry;
}

export function getStoredVideo(videoId: string): StoredVideoEntry | null {
  if (!videoId || typeof videoId !== "string") return null;
  const store = getVideoStore();
  const entry = store.get(videoId.trim());
  if (!entry) return null;

  if (entry.expiresAt <= Date.now() || !fs.existsSync(entry.filePath)) {
    store.delete(videoId);
    return null;
  }
  return entry;
}

export function clearVideoStore(): void {
  const store = getVideoStore();
  for (const entry of store.values()) {
    try {
      if (fs.existsSync(entry.filePath)) {
        fs.unlinkSync(entry.filePath);
      }
    } catch {
      // Ignore
    }
  }
  store.clear();
}

