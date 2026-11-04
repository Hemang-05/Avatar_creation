import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getTemporaryAudio } from "@/lib/avatar/avatarUtils";
import { generateAssSubtitles, generateCaptionSegments } from "./captionGenerator";
import { composeVideo } from "./composition";
import { probeMediaDuration } from "./ffmpeg";
import { registerVideo } from "./videoStore";
import {
  type VideoCompositionRequest,
  type VideoCompositionResult,
  VideoServiceError,
} from "./videoTypes";

function createTempWorkingDir(): string {
  const dir = path.join(os.tmpdir(), `newsai_compose_${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Resolves or downloads the presenter video to a local file path.
 */
async function resolvePresenterVideo(
  avatarVideoUrl: string,
  workingDir: string
): Promise<string> {
  const trimmed = avatarVideoUrl.trim();
  if (!trimmed) {
    throw new VideoServiceError("MISSING_INPUT", "Presenter video URL is required.", 400);
  }

  // Check if it's the local mock presenter video or a relative public asset
  const isPresenterMp4 =
    trimmed === "/presenter.mp4" ||
    trimmed === "presenter.mp4" ||
    trimmed.endsWith("/presenter.mp4");

  if (isPresenterMp4) {
    const publicPath = path.join(process.cwd(), "public", "presenter.mp4");
    if (fs.existsSync(publicPath)) {
      return publicPath;
    }
  }

  // If it's a relative path starting with /
  if (trimmed.startsWith("/")) {
    const localPublic = path.join(process.cwd(), "public", trimmed.slice(1));
    if (fs.existsSync(localPublic)) {
      return localPublic;
    }
  }

  // If it's a remote URL (e.g. from D-ID or S3)
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const response = await fetch(trimmed);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0) {
        throw new Error("Downloaded presenter video was empty.");
      }
      const downloadPath = path.join(workingDir, "presenter_download.mp4");
      fs.writeFileSync(downloadPath, buffer);
      return downloadPath;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new VideoServiceError(
        "MEDIA_FETCH_FAILED",
        `Failed to fetch presenter video from ${trimmed}: ${msg}`,
        502
      );
    }
  }

  // Check if it's an existing absolute or relative filesystem path
  if (fs.existsSync(trimmed)) {
    return path.resolve(trimmed);
  }

  throw new VideoServiceError(
    "MEDIA_FETCH_FAILED",
    `Could not locate or download presenter video from '${trimmed}'.`,
    400
  );
}

/**
 * Resolves or downloads the authoritative narration audio to a local MP3 file path.
 */
async function resolveNarrationAudio(
  request: VideoCompositionRequest,
  workingDir: string
): Promise<string> {
  let audioBuffer: Buffer | null = null;

  // 1. Check audioId in server-side temporary audio store
  if (request.audioId) {
    const entry = getTemporaryAudio(request.audioId);
    if (entry && entry.buffer && entry.buffer.byteLength > 0) {
      audioBuffer = entry.buffer;
    }
  }

  // 2. Check if audioUrl references a server audio bridge ID: /api/article/tts/audio/(aud_...)
  if (!audioBuffer && request.audioUrl) {
    const match = request.audioUrl.match(/api\/article\/tts\/audio\/(aud_[a-zA-Z0-9]+)/);
    if (match && match[1]) {
      const entry = getTemporaryAudio(match[1]);
      if (entry && entry.buffer && entry.buffer.byteLength > 0) {
        audioBuffer = entry.buffer;
      }
    }
  }

  // 3. If audioUrl is an external HTTP/HTTPS URL
  if (!audioBuffer && request.audioUrl && (request.audioUrl.startsWith("http://") || request.audioUrl.startsWith("https://"))) {
    try {
      const response = await fetch(request.audioUrl);
      if (response.ok) {
        const buf = Buffer.from(await response.arrayBuffer());
        if (buf.byteLength > 0) {
          audioBuffer = buf;
        }
      }
    } catch {
      // Continue to error if unresolved
    }
  }

  if (!audioBuffer) {
    throw new VideoServiceError(
      "MISSING_INPUT",
      "No valid narration audio found. Ensure ElevenLabs audio was generated.",
      400
    );
  }

  const audioPath = path.join(workingDir, "narration.mp3");
  fs.writeFileSync(audioPath, audioBuffer);
  return audioPath;
}

/**
 * High-level orchestration for Phase 7A Video Composition:
 * 1. Validates inputs & script.
 * 2. Resolves presenter video (mock or D-ID) and authoritative ElevenLabs audio.
 * 3. Probes audio duration.
 * 4. Generates ASS subtitles for headline, lower-third, and synchronized captions.
 * 5. Runs FFmpeg composition (1920x1080 16:9, H.264, AAC).
 * 6. Stores the result in the video store and cleans up temp files.
 */
export async function composeVideoService(
  request: VideoCompositionRequest
): Promise<VideoCompositionResult> {
  if (!request.newsScript || !request.newsScript.segments || request.newsScript.segments.length === 0) {
    throw new VideoServiceError(
      "INVALID_SCRIPT",
      "Valid news script with segments is required for video composition.",
      400
    );
  }

  const workingDir = createTempWorkingDir();

  try {
    // 1. Resolve presenter video & narration audio
    const presenterVideoPath = await resolvePresenterVideo(request.avatarVideoUrl, workingDir);
    const narrationAudioPath = await resolveNarrationAudio(request, workingDir);

    // 2. Probe authoritative audio duration
    const audioDuration = await probeMediaDuration(narrationAudioPath);
    if (!audioDuration || audioDuration <= 0) {
      throw new VideoServiceError(
        "MEDIA_FETCH_FAILED",
        "Authoritative narration audio duration could not be determined.",
        500
      );
    }

    // 3. Generate ASS subtitles
    const segments = generateCaptionSegments(request.newsScript, audioDuration);
    const headlineText = request.headline || request.newsScript.title || "";
    const assContent = generateAssSubtitles(segments, {
      headline: headlineText,
      sourceDomain: request.sourceDomain || "NewsAI Studio",
      totalDurationSeconds: audioDuration,
    });

    const assSubtitlePath = path.join(workingDir, "captions.ass");
    fs.writeFileSync(assSubtitlePath, assContent, "utf-8");

    // 4. Compose final MP4
    const composedOutputPath = path.join(workingDir, "final_composed.mp4");
    await composeVideo({
      presenterVideoPath,
      narrationAudioPath,
      assSubtitlePath,
      outputVideoPath: composedOutputPath,
    });

    if (!fs.existsSync(composedOutputPath) || fs.statSync(composedOutputPath).size === 0) {
      throw new VideoServiceError(
        "COMPOSITION_FAILED",
        "Video composition produced an empty or missing output file.",
        500
      );
    }

    // 5. Register video in persistent temp store
    const stored = registerVideo(composedOutputPath, audioDuration, 1920, 1080);

    return {
      videoId: stored.id,
      videoUrl: `/api/article/video/${stored.id}`,
      durationSeconds: Math.round(audioDuration * 10) / 10,
      width: 1920,
      height: 1080,
      format: "mp4",
      createdAt: new Date(stored.createdAt).toISOString(),
    };
  } finally {
    // Clean up temporary working directory
    try {
      fs.rmSync(workingDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}

