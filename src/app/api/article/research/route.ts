import { NextRequest, NextResponse } from "next/server";
import { researchArticle } from "@/lib/research/researchAgent";
import { ResearchAgentError } from "@/lib/research/researchTypes";
import { validateArticleInput } from "@/lib/research/researchUtils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_ARTICLE",
            message: "Request body must be a valid JSON object containing an 'article' field.",
          },
        },
        { status: 400 }
      );
    }

    const articleCandidate = (body as Record<string, unknown>).article;
    const validation = validateArticleInput(articleCandidate);

    if (!validation.isValid || !validation.article) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_ARTICLE",
            message: validation.reason || "A valid extracted article is required for research.",
          },
        },
        { status: 400 }
      );
    }

    const research = await researchArticle(validation.article);

    return NextResponse.json({
      success: true,
      research,
    });
  } catch (error: unknown) {
    if (error instanceof ResearchAgentError) {
      console.warn(`[Research API] Controlled error (${error.code}): ${error.message}`);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: error.statusCode }
      );
    }

    console.error("[Research API] Unexpected internal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred while researching the article.",
        },
      },
      { status: 500 }
    );
  }
}

