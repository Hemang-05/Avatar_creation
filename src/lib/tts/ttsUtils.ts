import { countWords } from "@/lib/script/scriptUtils";
import {
  MAX_TTS_SCRIPT_CHARS,
  MAX_TTS_SCRIPT_WORDS,
  TTSServiceError,
} from "./ttsTypes";

export interface ValidatedTTSScript {
  text: string;
  wordCount: number;
  title?: string;
}

/**
 * Validates that a NewsScript object contains a valid, non-empty fullScript within safe length bounds.
 * Never silently truncates scripts exceeding the maximum length.
 */
export function validateScriptForTTS(scriptInput: unknown): ValidatedTTSScript {
  if (!scriptInput || typeof scriptInput !== "object") {
    throw new TTSServiceError("INVALID_SCRIPT", "Invalid script", 400);
  }

  const obj = scriptInput as Record<string, unknown>;

  if (typeof obj.fullScript !== "string") {
    throw new TTSServiceError(
      "INVALID_SCRIPT",
      "Invalid script: 'fullScript' string is required.",
      400
    );
  }

  const trimmed = obj.fullScript.trim();
  if (!trimmed) {
    throw new TTSServiceError("EMPTY_SCRIPT", "Script cannot be empty", 400);
  }

  const wordCount = countWords(trimmed);
  if (wordCount === 0) {
    throw new TTSServiceError("EMPTY_SCRIPT", "Script cannot be empty", 400);
  }

  if (wordCount > MAX_TTS_SCRIPT_WORDS || trimmed.length > MAX_TTS_SCRIPT_CHARS) {
    throw new TTSServiceError(
      "SCRIPT_TOO_LONG",
      `Script exceeds maximum allowed length for TTS (${wordCount} words; max ${MAX_TTS_SCRIPT_WORDS} words).`,
      400
    );
  }

  return {
    text: trimmed,
    wordCount,
    title: typeof obj.title === "string" ? obj.title.trim() : undefined,
  };
}

/**
 * Converts a Web ReadableStream, Node Readable/AsyncIterable, Uint8Array, or Buffer
 * returned by the ElevenLabs SDK into a single Node.js Buffer.
 */
export async function audioStreamToBuffer(source: unknown): Promise<Buffer> {
  if (!source) {
    throw new TTSServiceError(
      "TTS_PROVIDER_ERROR",
      "TTS provider returned an empty audio stream.",
      502
    );
  }

  if (Buffer.isBuffer(source)) {
    return source;
  }

  if (source instanceof Uint8Array) {
    return Buffer.from(source);
  }

  if (source instanceof ArrayBuffer) {
    return Buffer.from(source);
  }

  // Handle Web ReadableStream (e.g. from @elevenlabs/elevenlabs-js in Node 20+)
  if (
    typeof source === "object" &&
    "getReader" in source &&
    typeof (source as ReadableStream<Uint8Array>).getReader === "function"
  ) {
    const reader = (source as ReadableStream<Uint8Array>).getReader();
    const chunks: Buffer[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(Buffer.from(value));
        }
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks);
  }

  // Handle AsyncIterable (e.g. Node Readable stream)
  if (
    typeof source === "object" &&
    Symbol.asyncIterator in source &&
    typeof (source as AsyncIterable<Uint8Array | Buffer>)[Symbol.asyncIterator] === "function"
  ) {
    const chunks: Buffer[] = [];
    for await (const chunk of source as AsyncIterable<Uint8Array | Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new TTSServiceError(
    "TTS_PROVIDER_ERROR",
    "Unrecognized audio stream format from TTS provider.",
    502
  );
}

/**
 * Maps raw SDK or network errors to sanitized, user-safe TTSServiceError instances.
 * Never leaks API keys or sensitive internal upstream payloads.
 */
export function sanitizeTTSError(err: unknown): TTSServiceError {
  if (err instanceof TTSServiceError) {
    return err;
  }

  if (err instanceof Error) {
    if (
      err.name === "AbortError" ||
      err.name === "TimeoutError" ||
      /timed?\s*out|aborted/i.test(err.message)
    ) {
      return new TTSServiceError(
        "TTS_TIMEOUT",
        "Voice generation timed out while contacting the TTS provider.",
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

  if (statusCode === 401 || statusCode === 403) {
    return new TTSServiceError(
      "TTS_AUTH_ERROR",
      "TTS provider authentication failed. Please verify the server TTS credentials.",
      502
    );
  }

  if (statusCode === 429) {
    return new TTSServiceError(
      "TTS_RATE_LIMIT",
      "TTS rate limit or character quota reached. Please try again shortly.",
      429
    );
  }

  return new TTSServiceError(
    "TTS_PROVIDER_ERROR",
    "TTS service failed to synthesize audio for this script.",
    502
  );
}

/**
 * Manages client-side Blob Object URLs for audio playback, ensuring previous URLs
 * are revoked on replacement, chat reset, or component unmount to prevent memory leaks.
 */
export class AudioObjectUrlManager {
  private currentUrl: string | null = null;
  private readonly createFn: (blob: Blob) => string;
  private readonly revokeFn: (url: string) => void;

  constructor(
    createFn: (blob: Blob) => string = (b) => URL.createObjectURL(b),
    revokeFn: (url: string) => void = (u) => URL.revokeObjectURL(u)
  ) {
    this.createFn = createFn;
    this.revokeFn = revokeFn;
  }

  /**
   * Creates a new Object URL for the given audio Blob and revokes any previously active URL.
   */
  createAndReplace(blob: Blob): string {
    this.revokeCurrent();
    const nextUrl = this.createFn(blob);
    this.currentUrl = nextUrl;
    return nextUrl;
  }

  /**
   * Revokes the currently active Object URL if one exists.
   */
  revokeCurrent(): void {
    if (this.currentUrl) {
      try {
        this.revokeFn(this.currentUrl);
      } catch {
        // Ignore revocation errors
      }
      this.currentUrl = null;
    }
  }

  getActiveUrl(): string | null {
    return this.currentUrl;
  }
}
