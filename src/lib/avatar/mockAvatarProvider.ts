import {
  AvatarGenerationRequest,
  AvatarProvider,
  AvatarServiceError,
  AvatarVideoResult,
  DEFAULT_PRESENTER_NAME,
  MOCK_AVATAR_VIDEO_URL,
} from "./avatarTypes";
import { isBrowserOnlyUrl } from "./avatarUtils";

export interface MockAvatarProviderConfig {
  presenterName?: string;
  sourceImageUrl?: string;
}

/**
 * Reusable Mock Avatar Provider for development and Phase 7 testing.
 * Returns the static `/presenter.mp4` fixture from `public/presenter.mp4`
 * without requiring D_ID_API_KEY or making any external D-ID API requests.
 */
export class MockAvatarProvider implements AvatarProvider {
  private readonly config: MockAvatarProviderConfig;

  constructor(config: MockAvatarProviderConfig = {}) {
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

    if (
      typeof request.audioUrl === "string" &&
      request.audioUrl.trim() &&
      isBrowserOnlyUrl(request.audioUrl)
    ) {
      throw new AvatarServiceError(
        "INVALID_AUDIO_REFERENCE",
        "Browser Blob/Object URLs cannot be passed to the avatar provider.",
        400
      );
    }

    const presenterName =
      (
        request.presenterName ??
        this.config.presenterName ??
        process.env.PRESENTER_NAME ??
        DEFAULT_PRESENTER_NAME
      ).trim() || DEFAULT_PRESENTER_NAME;

    const sourceImageUrl =
      (
        request.sourceImageUrl ??
        this.config.sourceImageUrl ??
        process.env.D_ID_SOURCE_IMAGE_URL ??
        MOCK_AVATAR_VIDEO_URL
      ).trim() || MOCK_AVATAR_VIDEO_URL;

    console.log(
      "[Avatar] Provider: mock (using static /presenter.mp4 fixture; zero D-ID API calls)"
    );

    return {
      videoUrl: MOCK_AVATAR_VIDEO_URL,
      provider: "mock",
      providerVideoId: "mock_presenter_fixture",
      status: "completed",
      sourceImageUrl,
      presenterName,
      generatedAt: new Date().toISOString(),
    };
  }
}

