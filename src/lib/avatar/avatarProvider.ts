import { DidProvider, DidProviderConfig } from "./didProvider";
import { MockAvatarProvider } from "./mockAvatarProvider";
import {
  AvatarProvider,
  AvatarServiceError,
  DEFAULT_AVATAR_PROVIDER,
} from "./avatarTypes";

export interface ResolveAvatarProviderOptions extends DidProviderConfig {
  providerName?: string;
}

/**
 * Resolves the configured AvatarProvider instance based on AVATAR_PROVIDER environment
 * variable or explicit options. Supports "did" (D-ID V2 Talks) and "mock" (/presenter.mp4 fixture).
 */
export function resolveAvatarProvider(
  options: ResolveAvatarProviderOptions = {}
): AvatarProvider {
  const rawProvider =
    options.providerName !== undefined
      ? options.providerName
      : process.env.AVATAR_PROVIDER !== undefined
      ? process.env.AVATAR_PROVIDER
      : DEFAULT_AVATAR_PROVIDER;

  if (typeof rawProvider !== "string") {
    throw new AvatarServiceError(
      "INVALID_REQUEST",
      "Invalid avatar provider configuration.",
      400
    );
  }

  const normalizedProvider = rawProvider.trim().toLowerCase();

  if (!normalizedProvider) {
    throw new AvatarServiceError(
      "MISSING_PROVIDER_CONFIG",
      "Avatar provider (AVATAR_PROVIDER) is not configured",
      500
    );
  }

  if (normalizedProvider === "mock") {
    return new MockAvatarProvider({
      presenterName: options.presenterName,
      sourceImageUrl: options.sourceImageUrl,
    });
  }

  if (normalizedProvider !== "did") {
    throw new AvatarServiceError(
      "UNSUPPORTED_PROVIDER",
      `Unsupported avatar provider '${normalizedProvider}'. Supported providers are 'did' and 'mock'.`,
      500
    );
  }

  return new DidProvider({
    apiKey: options.apiKey,
    sourceImageUrl: options.sourceImageUrl,
    presenterName: options.presenterName,
    baseUrl: options.baseUrl,
    pollIntervalMs: options.pollIntervalMs,
    maxPollAttempts: options.maxPollAttempts,
    requestTimeoutMs: options.requestTimeoutMs,
    fetchFn: options.fetchFn,
    sleepFn: options.sleepFn,
  });
}

