import { NextRequest, NextResponse } from "next/server";
import { extractArticle } from "@/lib/article/extractArticle";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body.url !== "string" || !body.url.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_URL",
            message: "Please provide a valid HTTP or HTTPS URL.",
          },
        },
        { status: 400 }
      );
    }

    const rawUrl = body.url.trim();

    // Invoke orchestrator
    const result = await extractArticle(rawUrl);

    if (result.success) {
      return NextResponse.json({
        success: true,
        article: result.article,
        extractionMethod: result.extractionMethod,
      });
    }

    // Determine status code based on error code
    let statusCode = 422;
    if (result.error.code === "INVALID_URL" || result.error.code === "SSRF_BLOCKED") {
      statusCode = 400;
    } else if (result.error.code === "UNREACHABLE") {
      statusCode = 502;
    }

    return NextResponse.json(
      {
        success: false,
        error: result.error,
      },
      { status: statusCode }
    );
  } catch (error: unknown) {
    console.error("[Article] API route internal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred while extracting the article.",
        },
      },
      { status: 500 }
    );
  }
}
