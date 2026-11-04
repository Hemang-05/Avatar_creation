import { NextRequest, NextResponse } from "next/server";
import { generateAvatarVideo } from "@/lib/avatar/avatarService";
import { AvatarServiceError } from "@/lib/avatar/avatarTypes";
import { sanitizeAvatarError } from "@/lib/avatar/avatarUtils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Invalid avatar generation request body.",
          },
        },
        { status: 400 }
      );
    }

    const result = await generateAvatarVideo(body);

    return NextResponse.json(
      {
        success: true,
        videoUrl: result.videoUrl,
        provider: result.provider,
        providerVideoId: result.providerVideoId,
        status: result.status,
        durationSeconds: result.durationSeconds,
        presenterName: result.presenterName,
        generatedAt: result.generatedAt,
        avatar: result,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const sanitized: AvatarServiceError = sanitizeAvatarError(err);
    console.warn(`[Avatar API] Error (${sanitized.code}): ${sanitized.message}`);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: sanitized.code,
          message: sanitized.message,
        },
      },
      { status: sanitized.statusCode }
    );
  }
}

