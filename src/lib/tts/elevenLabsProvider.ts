import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { countWords } from "@/lib/script/scriptUtils";
import {
  DEFAULT_ELEVENLABS_MODEL_ID,
  DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
  DEFAULT_ELEVENLABS_VOICE_ID,
  DEFAULT_TTS_TIMEOUT_MS,
  FALLBACK_FREE_TIER_ELEVENLABS_VOICE_ID,
  TTSProvider,
  TTSRequest,
  TTSResult,
  TTSServiceError,
} from "./ttsTypes";
import { audioStreamToBuffer, sanitizeTTSError } from "./ttsUtils";

export interface ElevenLabsClientLike {
  textToSpeech: {
    convert: (
      voiceId: string,
      request: {
        text: string;
        modelId?: string;
        outputFormat?: "mp3_44100_128";
      },
      requestOptions?: {
        abortSignal?: AbortSignal;
        timeoutInSeconds?: number;
      }
    ) => Promise<unknown>;
  };
}

export interface ElevenLabsProviderConfig {
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
  timeoutMs?: number;
  client?: ElevenLabsClientLike;
}

/**
 * Official ElevenLabs SDK TTS Provider implementation.
 */
export class ElevenLabsProvider implements TTSProvider {
  private readonly config: ElevenLabsProviderConfig;

  constructor(config: ElevenLabsProviderConfig = {}) {
    this.config = config;
  }

  async synthesize(request: TTSRequest): Promise<TTSResult> {
    const apiKey = (
      this.config.apiKey !== undefined
        ? this.config.apiKey
        : process.env.ELEVENLABS_API_KEY ?? ""
    ).trim();

    if (!apiKey) {
      throw new TTSServiceError(
        "MISSING_API_KEY",
        "TTS provider is not configured",
        500
      );
    }

    const rawVoiceId =
      request.voiceId !== undefined
        ? request.voiceId
        : this.config.voiceId !== undefined
        ? this.config.voiceId
        : process.env.ELEVENLABS_VOICE_ID !== undefined
        ? process.env.ELEVENLABS_VOICE_ID
        : DEFAULT_ELEVENLABS_VOICE_ID;

    const voiceId = rawVoiceId.trim();
    if (!voiceId) {
      throw new TTSServiceError(
        "MISSING_VOICE_ID",
        "TTS voice ID is not configured",
        500
      );
    }

    const rawModelId =
      request.modelId !== undefined
        ? request.modelId
        : this.config.modelId !== undefined
        ? this.config.modelId
        : process.env.ELEVENLABS_MODEL_ID !== undefined
        ? process.env.ELEVENLABS_MODEL_ID
        : DEFAULT_ELEVENLABS_MODEL_ID;

    const modelId = rawModelId.trim();
    if (!modelId) {
      throw new TTSServiceError(
        "MISSING_MODEL_ID",
        "TTS model ID is not configured",
        500
      );
    }

    const text = (request.text ?? "").trim();
    if (!text) {
      throw new TTSServiceError("EMPTY_SCRIPT", "Script cannot be empty", 400);
    }

    const timeoutMs =
      request.timeoutMs ?? this.config.timeoutMs ?? DEFAULT_TTS_TIMEOUT_MS;
    const timeoutInSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));

    const wordCount = countWords(text);
    console.log("[TTS] Provider: elevenlabs");
    console.log(`[TTS] Script word count: ${wordCount}`);
    console.log("[TTS] Voice ID: configured");
    console.log("[TTS] Generation started");

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const client: ElevenLabsClientLike =
        this.config.client ??
        new ElevenLabsClient({
          apiKey,
          timeoutInSeconds,
        });

      let effectiveVoiceId = voiceId;
      let audioStream: unknown;

      try {
        audioStream = await client.textToSpeech.convert(
          effectiveVoiceId,
          {
            text,
            modelId,
            outputFormat: DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
          },
          {
            abortSignal: controller.signal,
            timeoutInSeconds,
          }
        );
      } catch (convertErr: unknown) {
        const errObj =
          convertErr && typeof convertErr === "object"
            ? (convertErr as Record<string, unknown>)
            : {};
        const statusCode =
          typeof errObj.statusCode === "number"
            ? errObj.statusCode
            : typeof errObj.status === "number"
            ? errObj.status
            : undefined;

        if (
          statusCode === 402 &&
          effectiveVoiceId !== FALLBACK_FREE_TIER_ELEVENLABS_VOICE_ID
        ) {
          console.warn(
            "[TTS] Configured library voice requires a paid ElevenLabs plan (HTTP 402); falling back to pre-made presenter voice."
          );
          effectiveVoiceId = FALLBACK_FREE_TIER_ELEVENLABS_VOICE_ID;
          audioStream = await client.textToSpeech.convert(
            effectiveVoiceId,
            {
              text,
              modelId,
              outputFormat: DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
            },
            {
              abortSignal: controller.signal,
              timeoutInSeconds,
            }
          );
        } else {
          throw convertErr;
        }
      }

      const audioBuffer = await audioStreamToBuffer(audioStream);
      clearTimeout(timeoutId);

      if (!audioBuffer || audioBuffer.length === 0) {
        throw new TTSServiceError(
          "TTS_PROVIDER_ERROR",
          "TTS provider returned empty audio output.",
          502
        );
      }

      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[TTS] Generation completed in ${elapsedSec}s`);

      return {
        audio: audioBuffer,
        mimeType: "audio/mpeg",
        provider: "elevenlabs",
        voiceId: effectiveVoiceId,
        modelId,
        generatedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      throw sanitizeTTSError(err);
    }
  }
}

