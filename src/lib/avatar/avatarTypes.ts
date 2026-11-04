/**
 * Phase 6: AI Presenter Avatar + Lip Sync Types, Interfaces, and Constants
 */

export const DEFAULT_AVATAR_PROVIDER = "did";
export const DID_API_BASE_URL = "https://api.d-id.com";
export const DEFAULT_PRESENTER_NAME = "Hemang";
export const MOCK_AVATAR_VIDEO_URL = "/presenter.mp4";

/**
 * Polling configuration (~3s interval × 60 attempts = 180s max polling window
 * to accommodate 45–60s broadcast scripts on D-ID's rendering queue)
 */
export const DEFAULT_DID_POLL_INTERVAL_MS = 3000;
export const DEFAULT_DID_MAX_POLL_ATTEMPTS = 60;
export const DEFAULT_DID_REQUEST_TIMEOUT_MS = 20000;

/**
 * Temporary Server-Side Audio Bridge TTL (15 minutes)
 */
export const TEMP_AUDIO_TTL_MS = 15 * 60 * 1000;
export const MAX_TEMP_AUDIO_ENTRIES = 50;

export const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
] as const;

export type SupportedAvatarProviderName = "did" | "mock";

export type AvatarGenerationStatus =
  | "created"
  | "started"
  | "processing"
  | "completed"
  | "failed";

export interface PresenterConfig {
  name: string;
  sourceImageUrl: string;
  voiceId?: string;
}

export interface AvatarGenerationRequest {
  /**
   * Publicly accessible HTTPS/HTTP audio URL, or server-bridged audio URL.
   * Must NEVER be a browser-only blob: or data: URL.
   */
  audioUrl?: string;
  /**
   * Server-side temporary audio identifier from Phase 5 TTS audio bridge.
   */
  audioId?: string;
  /**
   * Optional raw audio buffer held server-side from Phase 5 synthesis.
   */
  audioBuffer?: Buffer;
  /**
   * Audio MIME type (defaults to "audio/mpeg").
   */
  audioMimeType?: string;
  /**
   * Optional override for the presenter source image URL (defaults to D_ID_SOURCE_IMAGE_URL).
   */
  sourceImageUrl?: string;
  /**
   * Optional presenter display name (defaults to "Hemang").
   */
  presenterName?: string;
  /**
   * Optional script title for diagnostics / metadata.
   */
  scriptTitle?: string;
}

export interface AvatarVideoResult {
  videoUrl: string;
  provider: SupportedAvatarProviderName;
  providerVideoId: string;
  status: "completed";
  durationSeconds?: number;
  sourceImageUrl: string;
  presenterName: string;
  generatedAt: string;
}

export interface AvatarProvider {
  createTalkingVideo(request: AvatarGenerationRequest): Promise<AvatarVideoResult>;
}

export type AvatarErrorCode =
  | "INVALID_REQUEST"
  | "MISSING_AUDIO"
  | "INVALID_AUDIO_REFERENCE"
  | "INVALID_AUDIO_MIME_TYPE"
  | "INVALID_PRESENTER_CONFIG"
  | "MISSING_API_KEY"
  | "MISSING_SOURCE_IMAGE_URL"
  | "MISSING_PROVIDER_CONFIG"
  | "UNSUPPORTED_PROVIDER"
  | "AVATAR_AUTH_ERROR"
  | "AVATAR_FORBIDDEN"
  | "AVATAR_INSUFFICIENT_CREDITS"
  | "AVATAR_NOT_FOUND"
  | "AVATAR_RATE_LIMIT"
  | "AVATAR_GENERATION_FAILED"
  | "AVATAR_TIMEOUT"
  | "AVATAR_PROVIDER_ERROR"
  | "INTERNAL_ERROR";

export interface AvatarApiError {
  code: AvatarErrorCode;
  message: string;
}

export interface AvatarSuccessResponse {
  success: true;
  videoUrl: string;
  provider: SupportedAvatarProviderName;
  providerVideoId: string;
  status: "completed";
  durationSeconds?: number;
  presenterName?: string;
  generatedAt: string;
  avatar: AvatarVideoResult;
}

export interface AvatarErrorResponse {
  success: false;
  error: AvatarApiError;
}

export type AvatarApiResponse = AvatarSuccessResponse | AvatarErrorResponse;

export class AvatarServiceError extends Error {
  public readonly code: AvatarErrorCode;
  public readonly statusCode: number;

  constructor(code: AvatarErrorCode, message: string, statusCode = 500) {
    super(message);
    this.name = "AvatarServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Client-side metadata for rendered avatar video cards in the chat UI
 */
export interface AvatarMetadata {
  videoUrl: string;
  provider: SupportedAvatarProviderName | string;
  providerVideoId: string;
  status: AvatarGenerationStatus;
  durationSeconds?: number;
  presenterName?: string;
  scriptTitle?: string;
  generatedAt?: string;
}

