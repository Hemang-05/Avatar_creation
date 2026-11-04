import crypto from "node:crypto";
import {
  ALLOWED_AUDIO_MIME_TYPES,
  AvatarServiceError,
  MAX_TEMP_AUDIO_ENTRIES,
  TEMP_AUDIO_TTL_MS,
} from "./avatarTypes";

export interface TemporaryAudioEntry {
  id: string;
  buffer: Buffer;
  mimeType: string;
  createdAt: number;
  expiresAt: number;
}

export interface ResolvedAvatarAudio {
  publicAudioUrl?: string;
  audioBuffer?: Buffer;
  mimeType: string;
  audioId?: string;
}

declare global {
  var __newsAiTempAudioStore: Map<string, TemporaryAudioEntry> | undefined;
}

function getAudioStore(): Map<string, TemporaryAudioEntry> {
  if (!globalThis.__newsAiTempAudioStore) {
    globalThis.__newsAiTempAudioStore = new Map<string, TemporaryAudioEntry>();
  }
  return globalThis.__newsAiTempAudioStore;
}

function pruneExpiredAudioEntries(store: Map<string, TemporaryAudioEntry>, now = Date.now()): void {
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt <= now) {
      store.delete(key);
    }
  }

  // Enforce upper bound by evicting oldest entries first
  while (store.size >= MAX_TEMP_AUDIO_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (!oldestKey) break;
    store.delete(oldestKey);
  }
}

/**
 * Registers synthesized ElevenLabs MP3 audio in the ephemeral server-side audio store
 * so Phase 6 (D-ID Avatar generation) can access the audio without relying on browser
 * blob: URLs or third-party cloud storage.
 */
export function registerTemporaryAudio(
  buffer: Buffer,
  mimeType = "audio/mpeg",
  ttlMs = TEMP_AUDIO_TTL_MS
): TemporaryAudioEntry {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0) {
    throw new AvatarServiceError(
      "MISSING_AUDIO",
      "Cannot register an empty audio buffer.",
      400
    );
  }

  const normalizedMime = validateAudioMimeType(mimeType);
  const store = getAudioStore();
  const now = Date.now();
  pruneExpiredAudioEntries(store, now);

  const id = `aud_${crypto.randomUUID().replace(/-/g, "")}`;
  const entry: TemporaryAudioEntry = {
    id,
    buffer,
    mimeType: normalizedMime,
    createdAt: now,
    expiresAt: now + Math.max(1000, ttlMs),
  };

  store.set(id, entry);
  return entry;
}

/**
 * Retrieves a non-expired temporary audio entry by ID from the server-side store.
 */
export function getTemporaryAudio(audioId: string): TemporaryAudioEntry | null {
  if (!audioId || typeof audioId !== "string") {
    return null;
  }
  const store = getAudioStore();
  const trimmed = audioId.trim();
  const entry = store.get(trimmed);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    store.delete(trimmed);
    return null;
  }
  return entry;
}

/**
 * Clears all entries in the temporary server-side audio store (used in tests).
 */
export function clearTemporaryAudioStore(): void {
  getAudioStore().clear();
}

/**
 * Builds the server-side audio bridge path or full URL for a registered audio ID.
 */
export function buildTemporaryAudioUrl(audioId: string, baseUrl?: string): string {
  const cleanId = encodeURIComponent(audioId.trim());
  const rawBase = (baseUrl ?? process.env.APP_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  if (rawBase && isPubliclyReachableUrl(rawBase)) {
    return `${rawBase}/api/article/tts/audio/${cleanId}`;
  }
  return `/api/article/tts/audio/${cleanId}`;
}

/**
 * Checks whether a URL string uses a browser-only or non-network scheme (blob:, data:, file:, etc.)
 */
export function isBrowserOnlyUrl(urlStr: string): boolean {
  const lower = urlStr.trim().toLowerCase();
  return (
    lower.startsWith("blob:") ||
    lower.startsWith("data:") ||
    lower.startsWith("file:") ||
    lower.startsWith("filesystem:") ||
    lower.startsWith("javascript:")
  );
}

/**
 * Checks whether a URL is a publicly reachable HTTP/HTTPS URL (not localhost, loopback, or private IP).
 */
export function isPubliclyReachableUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  const trimmed = urlStr.trim();
  if (isBrowserOnlyUrl(trimmed)) return false;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return false;
    }

    // Check private IPv4 ranges (10.x.x.x, 192.168.x.x, 172.16-31.x.x, 169.254.x.x)
    if (
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }

    // Require at least one dot in hostname (e.g. example.com)
    if (!host.includes(".")) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validates that an audio MIME type is a supported audio format (e.g. audio/mpeg).
 */
export function validateAudioMimeType(mimeTypeInput: unknown): string {
  if (typeof mimeTypeInput !== "string" || !mimeTypeInput.trim()) {
    throw new AvatarServiceError(
      "INVALID_AUDIO_MIME_TYPE",
      "Audio MIME type is required and must be a valid audio format.",
      400
    );
  }

  const baseMime = mimeTypeInput.split(";")[0].trim().toLowerCase();
  if (
    !(ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(baseMime)
  ) {
    throw new AvatarServiceError(
      "INVALID_AUDIO_MIME_TYPE",
      `Unsupported audio MIME type '${baseMime}'. Expected an audio format such as audio/mpeg.`,
      400
    );
  }

  return baseMime === "audio/mp3" ? "audio/mpeg" : baseMime;
}

/**
 * Validates that a URL intended to be passed directly to D-ID as audio_url is a valid,
 * publicly accessible HTTP/HTTPS URL and NEVER a browser Blob/Object URL.
 */
export function validatePublicAudioUrl(urlInput: unknown): string {
  if (typeof urlInput !== "string" || !urlInput.trim()) {
    throw new AvatarServiceError(
      "MISSING_AUDIO",
      "Audio URL cannot be empty.",
      400
    );
  }

  const trimmed = urlInput.trim();

  if (isBrowserOnlyUrl(trimmed)) {
    throw new AvatarServiceError(
      "INVALID_AUDIO_REFERENCE",
      "Browser Blob/Object URLs cannot be passed to D-ID. Use a server-accessible audio reference.",
      400
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AvatarServiceError(
      "INVALID_AUDIO_REFERENCE",
      "Invalid audio URL format.",
      400
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AvatarServiceError(
      "INVALID_AUDIO_REFERENCE",
      "Audio URL must use HTTP or HTTPS protocol.",
      400
    );
  }

  if (!isPubliclyReachableUrl(trimmed)) {
    throw new AvatarServiceError(
      "INVALID_AUDIO_REFERENCE",
      "Audio URL must be publicly reachable by the avatar provider (localhost/private URLs cannot be fetched directly by D-ID).",
      400
    );
  }

  return parsed.toString();
}

/**
 * Validates the configured presenter source image URL.
 */
export function validatePresenterImageUrl(urlInput: unknown): string {
  if (urlInput === undefined || urlInput === null) {
    throw new AvatarServiceError(
      "MISSING_SOURCE_IMAGE_URL",
      "Presenter source image URL (D_ID_SOURCE_IMAGE_URL) is not configured",
      500
    );
  }

  if (typeof urlInput !== "string") {
    throw new AvatarServiceError(
      "INVALID_PRESENTER_CONFIG",
      "Presenter source image URL must be a string",
      400
    );
  }

  const trimmed = urlInput.trim();
  if (!trimmed) {
    throw new AvatarServiceError(
      "MISSING_SOURCE_IMAGE_URL",
      "Presenter source image URL (D_ID_SOURCE_IMAGE_URL) is not configured",
      500
    );
  }

  if (isBrowserOnlyUrl(trimmed)) {
    throw new AvatarServiceError(
      "INVALID_PRESENTER_CONFIG",
      "Presenter source image URL cannot be a browser Blob or Data URL",
      400
    );
  }

  if (!isPubliclyReachableUrl(trimmed)) {
    throw new AvatarServiceError(
      "INVALID_PRESENTER_CONFIG",
      "Presenter source image URL must be a valid, publicly accessible HTTP/HTTPS URL",
      400
    );
  }

  return new URL(trimmed).toString();
}

/**
 * Extracts a temporary audioId if the URL points to `/api/article/tts/audio/<audioId>`.
 */
function extractAudioIdFromBridgePath(urlOrPath: string): string | null {
  const match = urlOrPath.match(/\/api\/article\/tts\/audio\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Resolves and validates the audio reference from Phase 5 for Phase 6 Avatar generation.
 * Rejects browser blob:/data: URLs, validates MIME types, and resolves temporary server-side
 * audio buffers or public HTTPS URLs.
 */
export function resolveAudioInputForAvatar(input: {
  audioId?: unknown;
  audioUrl?: unknown;
  audioBuffer?: unknown;
  audioBase64?: unknown;
  mimeType?: unknown;
}): ResolvedAvatarAudio {
  if (!input || typeof input !== "object") {
    throw new AvatarServiceError(
      "INVALID_REQUEST",
      "Invalid audio input for avatar generation.",
      400
    );
  }

  // Validate MIME type if explicitly provided
  const mimeType =
    input.mimeType !== undefined && input.mimeType !== null
      ? validateAudioMimeType(input.mimeType)
      : "audio/mpeg";

  // 1. Always check audioUrl first for illegal browser-only schemes (blob:, data:, etc.)
  const rawAudioUrl =
    typeof input.audioUrl === "string" ? input.audioUrl.trim() : "";

  if (input.audioUrl !== undefined && input.audioUrl !== null && typeof input.audioUrl !== "string") {
    throw new AvatarServiceError(
      "INVALID_AUDIO_REFERENCE",
      "Invalid audioUrl parameter.",
      400
    );
  }

  if (rawAudioUrl && isBrowserOnlyUrl(rawAudioUrl)) {
    throw new AvatarServiceError(
      "INVALID_AUDIO_REFERENCE",
      "Browser Blob/Object URLs cannot be passed to D-ID. Use a server-accessible audio reference.",
      400
    );
  }

  // 2. Check explicit audioId or bridge path /api/article/tts/audio/<audioId>
  const explicitAudioId =
    typeof input.audioId === "string" ? input.audioId.trim() : "";

  if (
    input.audioId !== undefined &&
    input.audioId !== null &&
    typeof input.audioId !== "string"
  ) {
    throw new AvatarServiceError(
      "INVALID_AUDIO_REFERENCE",
      "Invalid audioId parameter.",
      400
    );
  }

  const bridgeAudioId =
    explicitAudioId || (rawAudioUrl ? extractAudioIdFromBridgePath(rawAudioUrl) : null) || "";

  if (bridgeAudioId) {
    const entry = getTemporaryAudio(bridgeAudioId);
    if (entry) {
      const validatedMime = validateAudioMimeType(entry.mimeType);
      const maybePublicUrl =
        rawAudioUrl && isPubliclyReachableUrl(rawAudioUrl)
          ? rawAudioUrl
          : process.env.APP_PUBLIC_URL && isPubliclyReachableUrl(process.env.APP_PUBLIC_URL)
          ? buildTemporaryAudioUrl(bridgeAudioId, process.env.APP_PUBLIC_URL)
          : undefined;

      return {
        audioId: entry.id,
        audioBuffer: entry.buffer,
        publicAudioUrl: maybePublicUrl,
        mimeType: validatedMime,
      };
    }

    const hasFallbackBuffer =
      (Buffer.isBuffer(input.audioBuffer) && input.audioBuffer.byteLength > 0) ||
      (typeof input.audioBase64 === "string" && input.audioBase64.trim().length > 0);

    // If an explicit audioId or local bridge path was given, but isn't in the store
    // and no fallback buffer/base64 or external public URL was provided, return 404 or 400
    if (!hasFallbackBuffer && (!rawAudioUrl || !isPubliclyReachableUrl(rawAudioUrl))) {
      if (!/^aud_[a-zA-Z0-9_-]{6,}$/.test(bridgeAudioId)) {
        throw new AvatarServiceError(
          "INVALID_AUDIO_REFERENCE",
          "Invalid audio reference identifier.",
          400
        );
      }
      throw new AvatarServiceError(
        "AVATAR_NOT_FOUND",
        "Temporary audio resource was not found or has expired.",
        404
      );
    }
  }

  // 3. Direct Buffer or Base64 audio
  if (Buffer.isBuffer(input.audioBuffer)) {
    if (input.audioBuffer.byteLength === 0) {
      throw new AvatarServiceError("MISSING_AUDIO", "Audio buffer cannot be empty.", 400);
    }
    return {
      audioBuffer: input.audioBuffer,
      mimeType,
    };
  }

  if (typeof input.audioBase64 === "string" && input.audioBase64.trim()) {
    const cleanBase64 = input.audioBase64
      .trim()
      .replace(/^data:audio\/[a-zA-Z0-9.+-]+;base64,/, "");
    const buf = Buffer.from(cleanBase64, "base64");
    if (buf.byteLength === 0) {
      throw new AvatarServiceError(
        "INVALID_AUDIO_REFERENCE",
        "Invalid base64 audio payload.",
        400
      );
    }
    return {
      audioBuffer: buf,
      mimeType,
    };
  }

  // 4. Public HTTPS/HTTP audioUrl
  if (rawAudioUrl) {
    const validatedUrl = validatePublicAudioUrl(rawAudioUrl);
    return {
      publicAudioUrl: validatedUrl,
      mimeType,
    };
  }

  throw new AvatarServiceError(
    "MISSING_AUDIO",
    "ElevenLabs audio reference is required to generate the presenter avatar video.",
    400
  );
}

/**
 * Formats the D-ID API key into an HTTP Basic Authorization header without logging or leaking it.
 */
export function formatDidAuthorizationHeader(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (/^basic\s+/i.test(trimmed)) {
    return `Basic ${trimmed.replace(/^basic\s+/i, "").trim()}`;
  }
  return `Basic ${trimmed}`;
}

/**
 * Maps HTTP status codes returned by D-ID into safe, structured AvatarServiceError instances.
 */
export function mapDidHttpStatusError(status: number): AvatarServiceError {
  switch (status) {
    case 400:
      return new AvatarServiceError(
        "INVALID_REQUEST",
        "Avatar provider rejected the request parameters.",
        400
      );
    case 401:
      return new AvatarServiceError(
        "AVATAR_AUTH_ERROR",
        "Avatar provider authentication failed. Please check D-ID API credentials.",
        401
      );
    case 402:
      return new AvatarServiceError(
        "AVATAR_INSUFFICIENT_CREDITS",
        "Insufficient D-ID credits to generate presenter video.",
        402
      );
    case 403:
      return new AvatarServiceError(
        "AVATAR_FORBIDDEN",
        "Access forbidden by the avatar provider.",
        403
      );
    case 404:
      return new AvatarServiceError(
        "AVATAR_NOT_FOUND",
        "Requested avatar resource or talk was not found.",
        404
      );
    case 429:
      return new AvatarServiceError(
        "AVATAR_RATE_LIMIT",
        "Avatar provider rate limit reached. Please try again shortly.",
        429
      );
    case 504:
      return new AvatarServiceError(
        "AVATAR_TIMEOUT",
        "Avatar provider timed out while processing the video.",
        504
      );
    default:
      return new AvatarServiceError(
        "AVATAR_PROVIDER_ERROR",
        "Avatar provider encountered an upstream error.",
        502
      );
  }
}

/**
 * Sanitizes any error thrown during avatar generation so API keys, headers, or internal stack
 * traces are never leaked to the client.
 */
export function sanitizeAvatarError(err: unknown): AvatarServiceError {
  if (err instanceof AvatarServiceError) {
    return err;
  }

  if (err instanceof Error) {
    if (
      err.name === "AbortError" ||
      err.name === "TimeoutError" ||
      /timed?\s*out|aborted/i.test(err.message)
    ) {
      return new AvatarServiceError(
        "AVATAR_TIMEOUT",
        "Avatar video generation timed out.",
        504
      );
    }
  }

  const errObj =
    err && typeof err === "object" ? (err as Record<string, unknown>) : {};
  const statusCode =
    typeof errObj.statusCode === "number"
      ? errObj.statusCode
      : typeof errObj.status === "number"
      ? errObj.status
      : undefined;

  if (typeof statusCode === "number") {
    return mapDidHttpStatusError(statusCode);
  }

  return new AvatarServiceError(
    "AVATAR_PROVIDER_ERROR",
    "Avatar service failed to generate presenter video.",
    502
  );
}

