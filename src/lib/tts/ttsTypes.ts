/**
 * Phase 5: Text-to-Speech (TTS) Types, Interfaces, and Constants
 */

export const DEFAULT_ELEVENLABS_VOICE_ID = "onwK4e9ZLuTAKqWW03F9";
export const FALLBACK_FREE_TIER_ELEVENLABS_VOICE_ID = "onwK4e9ZLuTAKqWW03F9";
export const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_v4";
export const DEFAULT_ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";
export const DEFAULT_TTS_PROVIDER = "elevenlabs";

export const MAX_TTS_SCRIPT_WORDS = 400;
export const MAX_TTS_SCRIPT_CHARS = 3500;
export const DEFAULT_TTS_TIMEOUT_MS = 45000;

export type SupportedTTSProviderName = "elevenlabs";

export interface TTSRequest {
  text: string;
  voiceId?: string;
  modelId?: string;
  timeoutMs?: number;
}

export interface TTSResult {
  audio: Buffer;
  mimeType: string;
  provider: SupportedTTSProviderName;
  voiceId: string;
  modelId: string;
  generatedAt: string;
}

export interface TTSProvider {
  synthesize(request: TTSRequest): Promise<TTSResult>;
}

export type TTSErrorCode =
  | "INVALID_SCRIPT"
  | "EMPTY_SCRIPT"
  | "SCRIPT_TOO_LONG"
  | "UNSUPPORTED_PROVIDER"
  | "MISSING_API_KEY"
  | "MISSING_VOICE_ID"
  | "MISSING_MODEL_ID"
  | "TTS_AUTH_ERROR"
  | "TTS_RATE_LIMIT"
  | "TTS_TIMEOUT"
  | "TTS_PROVIDER_ERROR"
  | "INTERNAL_ERROR";

export interface TTSApiError {
  code: TTSErrorCode;
  message: string;
}

export interface TTSErrorResponse {
  success: false;
  error: TTSApiError;
}

export class TTSServiceError extends Error {
  public readonly code: TTSErrorCode;
  public readonly statusCode: number;

  constructor(code: TTSErrorCode, message: string, statusCode = 500) {
    super(message);
    this.name = "TTSServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface TTSServiceOptions {
  providerName?: string;
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
  timeoutMs?: number;
  providerInstance?: TTSProvider;
}

/**
 * Client-side metadata for rendered audio player cards in the chat UI
 */
export interface AudioMetadata {
  audioUrl: string;
  mimeType: string;
  audioId?: string;
  serverAudioUrl?: string;
  provider?: string;
  voiceId?: string;
  modelId?: string;
  scriptTitle?: string;
  wordCount?: number;
  estimatedDurationSeconds?: number;
  generatedAt?: string;
}

