import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import { VideoServiceError } from "./videoTypes";

const execFileAsync = promisify(execFile);

/**
 * Resolves the path to the FFmpeg executable.
 */
export function getFfmpegPath(): string {
  if (ffmpegStatic && typeof ffmpegStatic === "string") {
    return ffmpegStatic;
  }
  // Fallback to system ffmpeg if available in PATH
  return "ffmpeg";
}

export interface FfmpegRunOptions {
  timeoutMs?: number;
  maxBuffer?: number;
}

/**
 * Safely executes FFmpeg with array arguments to prevent shell injection.
 */
export async function runFfmpeg(
  args: string[],
  options: FfmpegRunOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  const binary = getFfmpegPath();
  const timeoutMs = options.timeoutMs ?? 180000; // 3 minutes max
  const maxBuffer = options.maxBuffer ?? 10 * 1024 * 1024; // 10MB

  try {
    const { stdout, stderr } = await execFileAsync(binary, args, {
      timeout: timeoutMs,
      maxBuffer,
    });
    return { stdout, stderr };
  } catch (err: unknown) {
    const error = err as { code?: string | number; stderr?: string; message?: string };
    const stderrMsg = error.stderr ? error.stderr.slice(-1500) : error.message || "Unknown FFmpeg error";
    throw new VideoServiceError(
      "FFMPEG_ERROR",
      `FFmpeg execution failed (code: ${error.code ?? "unknown"}): ${stderrMsg}`
    );
  }
}

/**
 * Probes the duration in seconds of an audio or video file using FFmpeg.
 */
export async function probeMediaDuration(filePath: string): Promise<number> {
  const binary = getFfmpegPath();
  let output = "";

  try {
    const res = await execFileAsync(binary, ["-i", filePath, "-f", "null", "-"], {
      timeout: 15000,
      maxBuffer: 5 * 1024 * 1024,
    });
    output = res.stderr || res.stdout || "";
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string };
    output = error.stderr || error.message || "";
  }

  const durationMatch = output.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2,3})/);
  if (durationMatch) {
    const hours = parseInt(durationMatch[1], 10);
    const minutes = parseInt(durationMatch[2], 10);
    const seconds = parseInt(durationMatch[3], 10);
    const sub = parseFloat(`0.${durationMatch[4]}`);
    return hours * 3600 + minutes * 60 + seconds + sub;
  }

  throw new VideoServiceError(
    "MEDIA_FETCH_FAILED",
    `Failed to determine media duration for file: ${filePath}. FFmpeg output: ${output.slice(-500)}`
  );
}
