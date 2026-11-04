import { ResearchResult } from "@/types/research";
import { DEFAULT_GEMINI_MODEL } from "@/lib/research/researchTypes";
import {
  NewsScript,
  ScriptApiResponse,
  ScriptGenerationOptions,
  ScriptGeneratorError,
} from "./scriptTypes";
import {
  normalizeResearchClaims,
  parseStructuredScriptJson,
  validateResearchInput,
} from "./scriptUtils";
import { buildScriptPrompt, SCRIPT_GENERATION_SCHEMA } from "./scriptPrompt";
import { validateAndNormalizeScript } from "./scriptValidator";

/**
 * Generates a broadcast-ready news presenter script from a Phase 3 ResearchResult
 * using Gemini 3.5 Flash-Lite with structured output.
 */
export async function generateScript(
  researchInput: ResearchResult,
  options: ScriptGenerationOptions = {}
): Promise<NewsScript> {
  // 1. Validate incoming ResearchResult
  const validation = validateResearchInput(researchInput);
  if (!validation.isValid || !validation.research) {
    throw new ScriptGeneratorError(
      "INVALID_RESEARCH",
      validation.reason || "Invalid ResearchResult supplied for script generation.",
      400
    );
  }

  const research = validation.research;

  // 2. Normalize and index research claims
  const { normalizedClaims } = normalizeResearchClaims(research);

  // 3. Verify Gemini API key
  const apiKey = (options.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new ScriptGeneratorError(
      "MISSING_GEMINI_KEY",
      "Server configuration error: GEMINI_API_KEY is not configured.",
      500
    );
  }

  const model = (options.geminiModel ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL).trim();
  const timeoutMs = options.geminiTimeoutMs ?? 45000;
  const fetchImpl = options.fetchFn ?? fetch;

  // 4. Build prompt & instructions
  const { prompt, systemInstruction } = buildScriptPrompt({
    research,
    normalizedClaims,
    tone: options.tone || "professional",
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  try {
    const requestBody: Record<string, unknown> = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: SCRIPT_GENERATION_SCHEMA,
      },
    };

    let response: Response | null = null;
    let lastError: Error | null = null;

    // Retry loop for transient 503 / high demand spikes
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        if (response.status === 503 && attempt < 3) {
          console.warn(`[ScriptGenerator] Gemini 503 high demand spike. Retrying in ${attempt * 1200}ms...`);
          await new Promise((r) => setTimeout(r, attempt * 1200));
          continue;
        }

        break;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < 3 && !(err instanceof Error && err.name === "AbortError")) {
          await new Promise((r) => setTimeout(r, attempt * 1200));
          continue;
        }
        throw err;
      }
    }

    clearTimeout(timeoutId);

    if (!response) {
      throw lastError || new Error("Failed to receive response from Gemini.");
    }

    if (response.status === 401 || response.status === 403) {
      throw new ScriptGeneratorError(
        "GEMINI_ERROR",
        "Gemini API authentication failed. Please verify GEMINI_API_KEY.",
        502
      );
    }

    if (response.status === 429) {
      throw new ScriptGeneratorError(
        "GEMINI_RATE_LIMIT",
        "Gemini API rate limit reached. Please try again shortly.",
        429
      );
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new ScriptGeneratorError(
        "GEMINI_ERROR",
        `Gemini API returned HTTP ${response.status}${errText ? `: ${errText.slice(0, 120)}` : ""}.`,
        502
      );
    }

    const payload = await response.json().catch(() => null);
    const candidateText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof candidateText !== "string" || !candidateText.trim()) {
      throw new ScriptGeneratorError(
        "INVALID_LLM_OUTPUT",
        "Gemini response did not contain structured text content.",
        502
      );
    }

    const parsedJson = parseStructuredScriptJson(candidateText);

    // 5. Runtime validation & normalization
    return validateAndNormalizeScript(parsedJson, research, normalizedClaims);
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    if (err instanceof ScriptGeneratorError) {
      throw err;
    }

    if (err instanceof Error && err.name === "AbortError") {
      throw new ScriptGeneratorError(
        "GEMINI_TIMEOUT",
        "Gemini request timed out while generating presenter script.",
        504
      );
    }

    const message = err instanceof Error ? err.message : String(err);
    throw new ScriptGeneratorError(
      "GEMINI_ERROR",
      `Failed to communicate with Gemini during script generation: ${message}`,
      502
    );
  }
}

/**
 * Safe wrapper that returns a structured ScriptApiResponse without throwing.
 */
export async function generateScriptSafe(
  researchInput: unknown,
  options: ScriptGenerationOptions = {}
): Promise<ScriptApiResponse> {
  const validation = validateResearchInput(researchInput);
  if (!validation.isValid || !validation.research) {
    return {
      success: false,
      error: {
        code: "INVALID_RESEARCH",
        message: validation.reason || "Please provide a valid ResearchResult object.",
      },
    };
  }

  try {
    const script = await generateScript(validation.research, options);
    return {
      success: true,
      script,
    };
  } catch (err: unknown) {
    if (err instanceof ScriptGeneratorError) {
      return {
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      };
    }

    const message =
      err instanceof Error ? err.message : "An unexpected error occurred during script generation.";
    return {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message,
      },
    };
  }
}

