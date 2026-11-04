import fs from "node:fs";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { getStoredVideo } from "@/lib/video/videoStore";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await context.params;
  const entry = getStoredVideo(videoId);

  if (!entry || !fs.existsSync(entry.filePath)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VIDEO_NOT_FOUND",
          message: "Composed video not found or expired.",
        },
      },
      { status: 404 }
    );
  }

  const stat = fs.statSync(entry.filePath);
  const fileSize = stat.size;
  const rangeHeader = req.headers.get("range");

  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || start >= fileSize || (parts[1] && isNaN(end)) || start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`,
        },
      });
    }

    const chunkSize = end - start + 1;
    const nodeStream = fs.createReadStream(entry.filePath, { start, end });
    const webStream = Readable.toWeb(nodeStream);

    return new Response(webStream as unknown as BodyInit, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": "video/mp4",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const nodeStream = fs.createReadStream(entry.filePath);
  const webStream = Readable.toWeb(nodeStream);

  return new Response(webStream as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Length": String(fileSize),
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

