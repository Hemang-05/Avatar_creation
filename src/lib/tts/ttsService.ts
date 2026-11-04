import { resolveTTSProvider, ResolveTTSProviderOptions } from "./ttsProvider";
import { TTSProvider, TTSRequest, TTSResult } from "./ttsTypes";
import { validateScriptForTTS } from "./ttsUtils";

export interface SynthesizeScriptOptions extends ResolveTTSProviderOptions {
  providerInstance?: TTSProvider;
}

/**
 * Validates a Phase 4 NewsScript and synthesizes its fullScript into MP3 audio
 * using the configured TTS provider.
 */
export async function synthesizeScript(
  scriptInput: unknown,
  options: SynthesizeScriptOptions = {}
): Promise<TTSResult> {
  const validated = validateScriptForTTS(scriptInput);

  const provider =
    options.providerInstance ?? resolveTTSProvider(options);

  return provider.synthesize({
    text: validated.text,
    voiceId: options.voiceId,
    modelId: options.modelId,
    timeoutMs: options.timeoutMs,
  });
}

/**
 * Synthesizes a direct TTSRequest using the resolved provider.
 */
export async function synthesizeText(
  request: TTSRequest,
  options: SynthesizeScriptOptions = {}
): Promise<TTSResult> {
  const provider =
    options.providerInstance ?? resolveTTSProvider(options);

  return provider.synthesize(request);
}

