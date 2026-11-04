import crypto from "node:crypto";
import {
  AvatarGenerationRequest,
  AvatarProvider,
  AvatarServiceError,
  AvatarVideoResult,
  DEFAULT_DID_MAX_POLL_ATTEMPTS,
  DEFAULT_DID_POLL_INTERVAL_MS,
  DEFAULT_DID_REQUEST_TIMEOUT_MS,
  DEFAULT_PRESENTER_NAME,
  DID_API_BASE_URL,
} from "./avatarTypes";
import {
  formatDidAuthorizationHeader,
  isPubliclyReachableUrl,
  mapDidHttpStatusError,
  resolveAudioInputForAvatar,
  sanitizeAvatarError,
  validatePresenterImageUrl,
} from "./avatarUtils";

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export interface DidProviderConfig {
  apiKey?: string;
  sourceImageUrl?: string;
  presenterName?: string;
  baseUrl?: string;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  requestTimeoutMs?: number;
  fetchFn?: FetchLike;
  sleepFn?: (ms: number) => Promise<void>;
}

declare global {
  var __newsAiDidTalkIdMap: Map<string, string> | undefined;
}

function getDidTalkIdMap(): Map<string, string> {
  if (!globalThis.__newsAiDidTalkIdMap) {
    globalThis.__newsAiDidTalkIdMap = new Map<string, string>();
  }
  return globalThis.__newsAiDidTalkIdMap;
}

function computeAudioTalkKey(
  sourceImageUrl: string,
  audioUrl?: string,
  audioBuffer?: Buffer
): string {
  const hash = crypto.createHash("sha256");
  hash.update(sourceImageUrl);
  if (audioBuffer && Buffer.isBuffer(audioBuffer)) {
    hash.update(audioBuffer);
  } else if (audioUrl) {
    hash.update(audioUrl);
  }
  return hash.digest("hex");
}

/**
 * D-ID V2 Photo Avatars / Talks Provider Implementation.
 * Combines a configured presenter portrait image with existing ElevenLabs audio
 * to generate a lip-synced talking presenter video.
 */
export class DidProvider implements AvatarProvider {
  private readonly config: DidProviderConfig;

  constructor(config: DidProviderConfig = {}) {
    this.config = config;
  }

  async createTalkingVideo(
    request: AvatarGenerationRequest
  ): Promise<AvatarVideoResult> {
    if (!request || typeof request !== "object") {
      throw new AvatarServiceError(
        "INVALID_REQUEST",
        "Invalid avatar generation request.",
        400
      );
    }

    // 1. Validate D-ID API Key
    const rawApiKey =
      this.config.apiKey !== undefined
        ? this.config.apiKey
        : process.env.D_ID_API_KEY ?? "";
    const apiKey = typeof rawApiKey === "string" ? rawApiKey.trim() : "";

    if (!apiKey) {
      throw new AvatarServiceError(
        "MISSING_API_KEY",
        "Avatar provider API key (D_ID_API_KEY) is not configured",
        500
      );
    }

    // 2. Validate Presenter Source Image URL
    const rawSourceImageUrl =
      request.sourceImageUrl !== undefined
        ? request.sourceImageUrl
        : this.config.sourceImageUrl !== undefined
        ? this.config.sourceImageUrl
        : process.env.D_ID_SOURCE_IMAGE_URL;

    const sourceImageUrl = validatePresenterImageUrl(rawSourceImageUrl);

    // 3. Resolve & validate ElevenLabs audio reference (never accepts browser blob: URLs)
    const resolvedAudio = resolveAudioInputForAvatar({
      audioId: request.audioId,
      audioUrl: request.audioUrl,
      audioBuffer: request.audioBuffer,
      mimeType: request.audioMimeType,
    });

    const presenterName =
      (
        request.presenterName ??
        this.config.presenterName ??
        process.env.PRESENTER_NAME ??
        DEFAULT_PRESENTER_NAME
      ).trim() || DEFAULT_PRESENTER_NAME;

    const baseUrl = (this.config.baseUrl ?? DID_API_BASE_URL).replace(/\/+$/, "");
    const pollIntervalMs =
      this.config.pollIntervalMs ?? DEFAULT_DID_POLL_INTERVAL_MS;
    const maxPollAttempts =
      this.config.maxPollAttempts ?? DEFAULT_DID_MAX_POLL_ATTEMPTS;
    const requestTimeoutMs =
      this.config.requestTimeoutMs ?? DEFAULT_DID_REQUEST_TIMEOUT_MS;

    if (pollIntervalMs <= 0 || maxPollAttempts <= 0) {
      throw new AvatarServiceError(
        "INVALID_REQUEST",
        "Invalid polling configuration for avatar provider.",
        400
      );
    }

    const fetchFn: FetchLike = this.config.fetchFn ?? globalThis.fetch;
    const sleepFn =
      this.config.sleepFn ??
      ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

    const authHeader = formatDidAuthorizationHeader(apiKey);

    console.log("[Avatar] Provider: did");
    console.log(`[Avatar] Presenter: ${presenterName}`);
    console.log("[Avatar] Source image: configured");

    const startTime = Date.now();

    try {
      const talkKey = computeAudioTalkKey(
        sourceImageUrl,
        resolvedAudio.publicAudioUrl,
        resolvedAudio.audioBuffer
      );
      const talkIdMap = getDidTalkIdMap();
      let talkId = this.config.fetchFn ? undefined : talkIdMap.get(talkKey);

      if (talkId) {
        console.log(
          `[Avatar] Resuming existing D-ID Talk (id: ${talkId}) without creating a duplicate talk...`
        );
      } else {
        // 4. Determine publicly-accessible audio_url for D-ID
        let effectiveAudioUrl = resolvedAudio.publicAudioUrl;

        if (!effectiveAudioUrl) {
          if (!resolvedAudio.audioBuffer) {
            throw new AvatarServiceError(
              "INVALID_AUDIO_REFERENCE",
              "Unable to resolve a publicly accessible audio URL or server audio buffer for D-ID.",
              400
            );
          }

          console.log(
            "[Avatar] Staging server-buffered ElevenLabs audio via D-ID /audios endpoint..."
          );
          effectiveAudioUrl = await this.uploadAudioToDid({
            audioBuffer: resolvedAudio.audioBuffer,
            mimeType: resolvedAudio.mimeType,
            baseUrl,
            authHeader,
            fetchFn,
            requestTimeoutMs,
          });
        }

        // 5. Create D-ID Talk (POST /talks) using script.type = "audio"
        console.log("[Avatar] Creating D-ID Talk...");
        talkId = await this.initiateTalk({
          sourceImageUrl,
          audioUrl: effectiveAudioUrl,
          baseUrl,
          authHeader,
          fetchFn,
          requestTimeoutMs,
        });

        if (!this.config.fetchFn) {
          talkIdMap.set(talkKey, talkId);
        }
        console.log(`[Avatar] D-ID Talk created (id: ${talkId}). Polling status...`);
      }

      // 6. Poll GET /talks/{talkId} until status === "done", failed, or maxPollAttempts
      for (let attempt = 1; attempt <= maxPollAttempts; attempt++) {
        await sleepFn(pollIntervalMs);

        const pollResult = await this.pollTalkStatus({
          talkId,
          attempt,
          maxPollAttempts,
          baseUrl,
          authHeader,
          fetchFn,
          requestTimeoutMs,
        });

        if (pollResult.state === "completed") {
          const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(
            `[Avatar] D-ID Talk completed in ${elapsedSec}s after ${attempt} poll attempt(s).`
          );

          return {
            videoUrl: pollResult.videoUrl,
            provider: "did",
            providerVideoId: talkId,
            status: "completed",
            durationSeconds: pollResult.durationSeconds,
            sourceImageUrl,
            presenterName,
            generatedAt: new Date().toISOString(),
          };
        }

        console.log(
          `[Avatar] Poll ${attempt}/${maxPollAttempts}: status=${pollResult.status}`
        );
      }

      // Exceeded maxPollAttempts without completing
      console.warn(
        `[Avatar] D-ID polling timed out after ${maxPollAttempts} attempts (talkId: ${talkId}).`
      );
      throw new AvatarServiceError(
        "AVATAR_TIMEOUT",
        "Avatar video generation timed out while waiting for D-ID processing to complete.",
        504
      );
    } catch (err: unknown) {
      throw sanitizeAvatarError(err);
    }
  }

  /**
   * Stages the server-side ElevenLabs MP3 audio buffer to D-ID's own /audios endpoint
   * when running without a public HTTPS callback hostname (e.g. localhost development).
   */
  private async uploadAudioToDid(params: {
    audioBuffer: Buffer;
    mimeType: string;
    baseUrl: string;
    authHeader: string;
    fetchFn: FetchLike;
    requestTimeoutMs: number;
  }): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), params.requestTimeoutMs);

    try {
      const formData = new FormData();
      const uint8 = new Uint8Array(params.audioBuffer);
      const audioBlob = new Blob([uint8], { type: params.mimeType || "audio/mpeg" });
      formData.append("audio", audioBlob, "presenter-speech.mp3");

      const response = await params.fetchFn(`${params.baseUrl}/audios`, {
        method: "POST",
        headers: {
          Authorization: params.authHeader,
          Accept: "application/json",
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw mapDidHttpStatusError(response.status);
      }

      const data = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      if (!data || typeof data !== "object" || typeof data.url !== "string" || !data.url.trim()) {
        throw new AvatarServiceError(
          "AVATAR_PROVIDER_ERROR",
          "Malformed response from avatar provider when staging audio.",
          502
        );
      }

      return data.url.trim();
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      throw sanitizeAvatarError(err);
    }
  }

  /**
   * Calls POST https://api.d-id.com/talks with the presenter image and ElevenLabs audio URL.
   * Strictly uses script.type = "audio" so D-ID never synthesizes a second voice.
   */
  private async initiateTalk(params: {
    sourceImageUrl: string;
    audioUrl: string;
    baseUrl: string;
    authHeader: string;
    fetchFn: FetchLike;
    requestTimeoutMs: number;
  }): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), params.requestTimeoutMs);

    try {
      const payload = {
        source_url: params.sourceImageUrl,
        script: {
          type: "audio" as const,
          audio_url: params.audioUrl,
        },
      };

      const response = await params.fetchFn(`${params.baseUrl}/talks`, {
        method: "POST",
        headers: {
          Authorization: params.authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw mapDidHttpStatusError(response.status);
      }

      const data = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      if (
        !data ||
        typeof data !== "object" ||
        typeof data.id !== "string" ||
        !data.id.trim()
      ) {
        throw new AvatarServiceError(
          "AVATAR_PROVIDER_ERROR",
          "Malformed response from avatar provider when creating talk.",
          502
        );
      }

      return data.id.trim();
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      throw sanitizeAvatarError(err);
    }
  }

  /**
   * Polls GET https://api.d-id.com/talks/{talkId} once and evaluates its status.
   */
  private async pollTalkStatus(params: {
    talkId: string;
    attempt: number;
    maxPollAttempts: number;
    baseUrl: string;
    authHeader: string;
    fetchFn: FetchLike;
    requestTimeoutMs: number;
  }): Promise<
    | { state: "pending"; status: "created" | "started" }
    | { state: "completed"; videoUrl: string; durationSeconds?: number }
  > {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), params.requestTimeoutMs);

    try {
      const response = await params.fetchFn(
        `${params.baseUrl}/talks/${encodeURIComponent(params.talkId)}`,
        {
          method: "GET",
          headers: {
            Authorization: params.authHeader,
            Accept: "application/json",
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw mapDidHttpStatusError(response.status);
      }

      const data = (await response.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;

      if (!data || typeof data !== "object" || typeof data.status !== "string") {
        throw new AvatarServiceError(
          "AVATAR_PROVIDER_ERROR",
          "Malformed status response from avatar provider.",
          502
        );
      }

      const status = data.status.trim().toLowerCase();

      if (status === "created" || status === "started") {
        return { state: "pending", status };
      }

      if (status === "done") {
        const resultUrl =
          typeof data.result_url === "string" ? data.result_url.trim() : "";

        if (!resultUrl || !isPubliclyReachableUrl(resultUrl)) {
          throw new AvatarServiceError(
            "AVATAR_PROVIDER_ERROR",
            "Avatar provider completed without returning a valid video result_url.",
            502
          );
        }

        const durationSeconds =
          typeof data.duration === "number" &&
          Number.isFinite(data.duration) &&
          data.duration > 0
            ? Math.round(data.duration * 10) / 10
            : undefined;

        return {
          state: "completed",
          videoUrl: resultUrl,
          durationSeconds,
        };
      }

      if (status === "error" || status === "rejected" || status === "failed") {
        throw new AvatarServiceError(
          "AVATAR_GENERATION_FAILED",
          "Avatar provider failed to generate the talking presenter video.",
          502
        );
      }

      throw new AvatarServiceError(
        "AVATAR_PROVIDER_ERROR",
        `Unexpected status '${status}' returned by avatar provider.`,
        502
      );
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      throw sanitizeAvatarError(err);
    }
  }
}

