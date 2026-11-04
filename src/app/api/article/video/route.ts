import { NextRequest, NextResponse } from "next/server";
import { composeVideoService } from "@/lib/video/videoService";
import { VideoServiceError } from "@/lib/video/videoTypes";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "MISSING_INPUT",
            message: "Invalid video composition request body.",
          },
        },
        { status: 400 }
      );
    }

    if (!body.avatarVideoUrl) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "MISSING_INPUT",
            message: "Missing 'avatarVideoUrl' for video composition.",
          },
        },
        { status: 400 }
      );
    }

    if (!body.newsScript) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_SCRIPT",
            message: "Missing 'newsScript' for video composition.",
          },
        },
        { status: 400 }
      );
    }

    const result = await composeVideoService(body);

    return NextResponse.json(
      {
        success: true,
        videoUrl: result.videoUrl,
        videoId: result.videoId,
        durationSeconds: result.durationSeconds,
        width: result.width,
        height: result.height,
        format: result.format,
        createdAt: result.createdAt,
        video: result,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof VideoServiceError) {
      console.warn(`[Video API] Error (${err.code}): ${err.message}`);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: err.code,
            message: err.message,
          },
        },
        { status: err.statusCode }
      );
    }

    const message = err instanceof Error ? err.message : "Internal error during video composition.";
    console.error("[Video API] Unhandled error:", err);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message,
        },
      },
      { status: 500 }
    );
  }
}

