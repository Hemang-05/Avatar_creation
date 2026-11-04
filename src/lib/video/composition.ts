import path from "node:path";
import { runFfmpeg } from "./ffmpeg";
import { VideoServiceError } from "./videoTypes";

export interface ComposeOptions {
  presenterVideoPath: string;
  narrationAudioPath: string;
  assSubtitlePath: string;
  outputVideoPath: string;
}

/**
 * Escapes file path for FFmpeg filter argument.
 * Escapes backslashes, colons, and single quotes.
 */
export function escapeFilterPath(rawPath: string): string {
  return rawPath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

/**
 * Executes server-side FFmpeg composition to produce 1080p 16:9 MP4 with burned-in subtitles
 * and authoritative ElevenLabs narration.
 */
export async function composeVideo(options: ComposeOptions): Promise<void> {
  const { presenterVideoPath, narrationAudioPath, assSubtitlePath, outputVideoPath } = options;

  const escapedSubtitlePath = escapeFilterPath(path.resolve(assSubtitlePath));

  // Filter chain:
  // 1. Scale with force_original_aspect_ratio=increase to cover 1920x1080
  // 2. Crop to exact 1920x1080 centered
  // 3. Burn ASS subtitles (Headline + LowerThird + Captions)
  const filterGraph = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,ass='${escapedSubtitlePath}'`;

  // Single video stream filter chain with -vf
  const vfArgs: string[] = [
    "-y",
    "-stream_loop", "-1",
    "-i", presenterVideoPath,
    "-i", narrationAudioPath,
    "-vf", filterGraph,
    "-map", "0:v:0",
    "-map", "1:a:0", // Authoritative ElevenLabs narration audio only
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "22",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest", // Cut off when narration audio ends
    "-movflags", "+faststart",
    outputVideoPath,
  ];

  try {
    await runFfmpeg(vfArgs, { timeoutMs: 180000 });
  } catch (err: unknown) {
    if (err instanceof VideoServiceError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new VideoServiceError(
      "COMPOSITION_FAILED",
      `Video composition failed: ${message}`
    );
  }
}
