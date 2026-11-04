import {
  resolveAvatarProvider,
  ResolveAvatarProviderOptions,
} from "./avatarProvider";
import { MockAvatarProvider } from "./mockAvatarProvider";
import {
  AvatarGenerationRequest,
  AvatarProvider,
  AvatarServiceError,
  AvatarVideoResult,
} from "./avatarTypes";
import {
  isBrowserOnlyUrl,
  resolveAudioInputForAvatar,
  validateAudioMimeType,
} from "./avatarUtils";

export interface GenerateAvatarOptions extends ResolveAvatarProviderOptions {
  providerInstance?: AvatarProvider;
}

export interface AvatarServiceInput {
  script?: unknown;
  audioId?: unknown;
  audioUrl?: unknown;
  audioBuffer?: unknown;
  audioBase64?: unknown;
  mimeType?: unknown;
  sourceImageUrl?: unknown;
  presenterName?: unknown;
}

/**
 * Validates the Phase 6 avatar generation request, resolves the ElevenLabs audio
 * reference via the server-side audio bridge (never passing browser blob: URLs),
 * and generates a lip-synced talking presenter video via the configured AvatarProvider.
 */
export async function generateAvatarVideo(
  input: unknown,
  options: GenerateAvatarOptions = {}
): Promise<AvatarVideoResult> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AvatarServiceError(
      "INVALID_REQUEST",
      "Invalid avatar generation request body.",
      400
    );
  }

  const candidate = input as AvatarServiceInput;

  // Validate optional script metadata if supplied
  let scriptTitle: string | undefined;
  if (candidate.script !== undefined) {
    if (
      !candidate.script ||
      typeof candidate.script !== "object" ||
      Array.isArray(candidate.script)
    ) {
      throw new AvatarServiceError(
        "INVALID_REQUEST",
        "Invalid script object in avatar request.",
        400
      );
    }

    const scriptObj = candidate.script as Record<string, unknown>;
    if (
      scriptObj.fullScript !== undefined &&
      (typeof scriptObj.fullScript !== "string" || !scriptObj.fullScript.trim())
    ) {
      throw new AvatarServiceError(
        "INVALID_REQUEST",
        "Script fullScript cannot be empty.",
        400
      );
    }

    if (typeof scriptObj.title === "string" && scriptObj.title.trim()) {
      scriptTitle = scriptObj.title.trim();
    }
  }

  if (
    candidate.sourceImageUrl !== undefined &&
    candidate.sourceImageUrl !== null &&
    typeof candidate.sourceImageUrl !== "string"
  ) {
    throw new AvatarServiceError(
      "INVALID_PRESENTER_CONFIG",
      "Presenter sourceImageUrl must be a string.",
      400
    );
  }

  // Always reject browser-only Blob/Data URLs regardless of provider
  if (
    typeof candidate.audioUrl === "string" &&
    candidate.audioUrl.trim() &&
    isBrowserOnlyUrl(candidate.audioUrl)
  ) {
    throw new AvatarServiceError(
      "INVALID_AUDIO_REFERENCE",
      "Browser Blob/Object URLs cannot be passed to D-ID. Use a server-accessible audio reference.",
      400
    );
  }

  const provider =
    options.providerInstance ?? resolveAvatarProvider(options);

  if (provider instanceof MockAvatarProvider) {
    const mimeType =
      candidate.mimeType !== undefined && candidate.mimeType !== null
        ? validateAudioMimeType(candidate.mimeType)
        : "audio/mpeg";

    return provider.createTalkingVideo({
      audioId:
        typeof candidate.audioId === "string" ? candidate.audioId : undefined,
      audioUrl:
        typeof candidate.audioUrl === "string" ? candidate.audioUrl : undefined,
      audioMimeType: mimeType,
      sourceImageUrl:
        typeof candidate.sourceImageUrl === "string"
          ? candidate.sourceImageUrl
          : options.sourceImageUrl,
      presenterName:
        typeof candidate.presenterName === "string"
          ? candidate.presenterName
          : options.presenterName,
      scriptTitle,
    });
  }

  // Validate & resolve ElevenLabs audio reference for real providers (e.g. D-ID)
  const resolvedAudio = resolveAudioInputForAvatar({
    audioId: candidate.audioId,
    audioUrl: candidate.audioUrl,
    audioBuffer: candidate.audioBuffer,
    audioBase64: candidate.audioBase64,
    mimeType: candidate.mimeType,
  });

  const request: AvatarGenerationRequest = {
    audioId: resolvedAudio.audioId,
    audioUrl: resolvedAudio.publicAudioUrl,
    audioBuffer: resolvedAudio.audioBuffer,
    audioMimeType: resolvedAudio.mimeType,
    sourceImageUrl:
      typeof candidate.sourceImageUrl === "string"
        ? candidate.sourceImageUrl
        : options.sourceImageUrl,
    presenterName:
      typeof candidate.presenterName === "string"
        ? candidate.presenterName
        : options.presenterName,
    scriptTitle,
  };

  return provider.createTalkingVideo(request);
}

