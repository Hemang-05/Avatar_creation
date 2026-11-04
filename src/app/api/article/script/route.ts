import { NextRequest, NextResponse } from "next/server";
import { generateScript } from "@/lib/script/scriptGenerator";
import { ScriptGeneratorError } from "@/lib/script/scriptTypes";
import { validateResearchInput } from "@/lib/script/scriptUtils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_RESEARCH",
            message: "Request body must be a valid JSON object containing a 'research' field.",
          },
        },
        { status: 400 }
      );
    }

    const researchCandidate = (body as Record<string, unknown>).research;
    const validation = validateResearchInput(researchCandidate);

    if (!validation.isValid || !validation.research) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_RESEARCH",
            message: validation.reason || "A valid Phase 3 ResearchResult is required for script generation.",
          },
        },
        { status: 400 }
      );
    }

    const script = await generateScript(validation.research);

    return NextResponse.json({
      success: true,
      script,
    });
  } catch (error: unknown) {
    if (error instanceof ScriptGeneratorError) {
      console.warn(`[Script API] Controlled error (${error.code}): ${error.message}`);
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

    console.error("[Script API] Unexpected internal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred while generating the presenter script.",
        },
      },
      { status: 500 }
    );
  }
}

