import type { NewsScript } from "@/lib/script/scriptTypes";

export interface VideoCompositionRequest {
  avatarVideoUrl: string;
  audioUrl?: string;
  audioId?: string;
  newsScript: NewsScript;
  headline?: string;
  sourceDomain?: string;
}

export interface VideoCompositionResult {
  videoId: string;
  videoUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  format: "mp4";
  createdAt: string;
}

export interface CaptionSegment {
  speaker: string;
  text: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
}

export type VideoErrorCode =
  | "MISSING_INPUT"
  | "INVALID_SCRIPT"
  | "MEDIA_FETCH_FAILED"
  | "FFMPEG_ERROR"
  | "COMPOSITION_FAILED"
  | "VIDEO_NOT_FOUND"
  | "INTERNAL_ERROR";

export class VideoServiceError extends Error {
  code: VideoErrorCode;
  statusCode: number;

  constructor(code: VideoErrorCode, message: string, statusCode = 500) {
    super(message);
    this.name = "VideoServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

