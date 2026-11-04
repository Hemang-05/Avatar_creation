import { NextRequest, NextResponse } from "next/server";
import { getTemporaryAudio } from "@/lib/avatar/avatarUtils";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ audioId: string }> }
) {
  const { audioId } = await context.params;
  const entry = getTemporaryAudio(audioId);

  if (!entry) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "AVATAR_NOT_FOUND",
          message: "Temporary audio resource was not found or has expired.",
        },
      },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(entry.buffer), {
    status: 200,
    headers: {
      "Content-Type": entry.mimeType || "audio/mpeg",
      "Content-Length": String(entry.buffer.byteLength),
      "Cache-Control": "private, max-age=900",
    },
  });
}

