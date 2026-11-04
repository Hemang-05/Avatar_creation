import { ElevenLabsProvider, ElevenLabsProviderConfig } from "./elevenLabsProvider";
import {
  DEFAULT_TTS_PROVIDER,
  TTSProvider,
  TTSServiceError,
} from "./ttsTypes";

export interface ResolveTTSProviderOptions extends ElevenLabsProviderConfig {
  providerName?: string;
}

/**
 * Resolves the configured TTSProvider instance based on TTS_PROVIDER environment variable
 * or explicit options. Currently supports "elevenlabs".
 */
export function resolveTTSProvider(
  options: ResolveTTSProviderOptions = {}
): TTSProvider {
  const rawProvider =
    options.providerName !== undefined
      ? options.providerName
      : process.env.TTS_PROVIDER !== undefined
      ? process.env.TTS_PROVIDER
      : DEFAULT_TTS_PROVIDER;

  const normalizedProvider = rawProvider.trim().toLowerCase() || DEFAULT_TTS_PROVIDER;

  if (normalizedProvider !== "elevenlabs") {
    throw new TTSServiceError(
      "UNSUPPORTED_PROVIDER",
      `Unsupported TTS provider '${normalizedProvider}'. Only 'elevenlabs' is currently supported.`,
      500
    );
  }

  return new ElevenLabsProvider({
    apiKey: options.apiKey,
    voiceId: options.voiceId,
    modelId: options.modelId,
    timeoutMs: options.timeoutMs,
    client: options.client,
  });
}

