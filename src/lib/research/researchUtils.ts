import { Article } from "@/lib/article/articleTypes";
import {
  ArticleAnalysisOutput,
  ClaimVerificationStatus,
  DEFAULT_GEMINI_MODEL,
  EvaluatedClaimItem,
  EvidenceEvaluationOutput,
  ExtractedClaimItem,
  QueryGenerationOutput,
  ResearchAgentError,
  ResearchClaim,
  ResearchResult,
  ResearchSource,
  ResearchTimelineEvent,
} from "./researchTypes";

const VALID_CLAIM_STATUSES = new Set<ClaimVerificationStatus>([
  "verified",
  "partially_verified",
  "contradicted",
  "unverified",
]);

/**
 * Validates that the incoming request body contains a usable Phase 2 Article.
 */
export function validateArticleInput(input: unknown): {
  isValid: boolean;
  article?: Article;
  reason?: string;
} {
  if (!input || typeof input !== "object") {
    return { isValid: false, reason: "Article payload must be a valid JSON object." };
  }

  const candidate = input as Record<string, unknown>;

  if (typeof candidate.url !== "string" || !candidate.url.trim()) {
    return { isValid: false, reason: "Article URL is required." };
  }

  try {
    const parsedUrl = new URL(candidate.url.trim());
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return { isValid: false, reason: "Article URL must use HTTP or HTTPS protocol." };
    }
  } catch {
    return { isValid: false, reason: "Article URL is malformed." };
  }

  if (typeof candidate.title !== "string" || candidate.title.trim().length < 3) {
    return { isValid: false, reason: "Article title is required and must be at least 3 characters." };
  }

  if (typeof candidate.content !== "string" || candidate.content.trim().length < 20) {
    return { isValid: false, reason: "Article content is missing or too short to research." };
  }

  const content = candidate.content.trim();
  const wordCount =
    typeof candidate.wordCount === "number" && candidate.wordCount > 0
      ? candidate.wordCount
      : content.split(/\s+/).filter(Boolean).length;

  return {
    isValid: true,
    article: {
      url: candidate.url.trim(),
      title: candidate.title.trim(),
      description: typeof candidate.description === "string" ? candidate.description.trim() : undefined,
      author: typeof candidate.author === "string" ? candidate.author.trim() : undefined,
      publishedAt: typeof candidate.publishedAt === "string" ? candidate.publishedAt.trim() : undefined,
      source: typeof candidate.source === "string" ? candidate.source.trim() : undefined,
      content,
      wordCount,
    },
  };
}

/**
 * Extracts clean domain name from a URL string.
 */
export function extractDomain(urlString: string): string {
  try {
    const url = new URL(urlString);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Normalizes a URL for strict source comparison.
 */
export function normalizeUrlForComparison(urlString: string): string {
  try {
    const parsed = new URL(urlString.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    parsed.hash = "";
    const normalized = parsed.toString();
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  } catch {
    return "";
  }
}

/**
 * Security enforcement: Filters candidate URLs returned by the LLM so that ONLY URLs
 * genuinely present in the Tavily search results are allowed.
 * Prevents hallucinated or fabricated URLs from ever appearing in ResearchResult.
 */
export function filterValidTavilyUrls(
  candidateUrls: unknown,
  tavilySources: ResearchSource[]
): string[] {
  if (!Array.isArray(candidateUrls) || tavilySources.length === 0) {
    return [];
  }

  // Map normalized URL -> canonical Tavily URL
  const canonicalUrlMap = new Map<string, string>();
  for (const source of tavilySources) {
    const norm = normalizeUrlForComparison(source.url);
    if (norm) {
      canonicalUrlMap.set(norm, source.url);
    }
  }

  const verifiedUrls: string[] = [];
  const seen = new Set<string>();

  for (const rawUrl of candidateUrls) {
    if (typeof rawUrl !== "string") continue;
    const norm = normalizeUrlForComparison(rawUrl);
    if (!norm) continue;

    const canonical = canonicalUrlMap.get(norm);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      verifiedUrls.push(canonical);
    }
  }

  return verifiedUrls;
}

/**
 * Safely parses JSON from Gemini text output and throws INVALID_LLM_OUTPUT on failure.
 */
export function parseStructuredJson(rawText: string): unknown {
  if (!rawText || typeof rawText !== "string") {
    throw new ResearchAgentError(
      "INVALID_LLM_OUTPUT",
      "Gemini returned an empty response instead of structured JSON.",
      502
    );
  }

  const trimmed = rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    throw new ResearchAgentError(
      "INVALID_LLM_OUTPUT",
      "Gemini returned malformed JSON that failed structured schema parsing.",
      502
    );
  }
}

/**
 * Validates Step 1 (Article Analysis & Claim Extraction) output from Gemini.
 */
export function validateArticleAnalysisOutput(data: unknown): ArticleAnalysisOutput {
  if (!data || typeof data !== "object") {
    throw new ResearchAgentError(
      "INVALID_LLM_OUTPUT",
      "Claim extraction output is not a valid JSON object.",
      502
    );
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.mainStory !== "string" || !obj.mainStory.trim()) {
    throw new ResearchAgentError(
      "INVALID_LLM_OUTPUT",
      "Claim extraction output is missing a valid 'mainStory' string.",
      502
    );
  }

  if (!Array.isArray(obj.claims) || obj.claims.length === 0) {
    throw new ResearchAgentError(
      "INVALID_LLM_OUTPUT",
      "Claim extraction output must contain a non-empty 'claims' array.",
      502
    );
  }

  const validCategories = new Set([
    "score_stat",
    "event",
    "entity",
    "date",
    "quote",
    "context",
  ]);

  const claims: ExtractedClaimItem[] = [];
  for (const item of obj.claims) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (typeof c.claim !== "string" || !c.claim.trim()) continue;

    const category =
      typeof c.category === "string" && validCategories.has(c.category)
        ? (c.category as ExtractedClaimItem["category"])
        : "event";

    claims.push({
      claim: c.claim.trim(),
      requiresVerification:
        typeof c.requiresVerification === "boolean" ? c.requiresVerification : true,
      category,
    });
  }

  if (claims.length === 0) {
    throw new ResearchAgentError(
      "INVALID_LLM_OUTPUT",
      "Claim extraction produced no valid claim items.",
      502
    );
  }

  const keyEntities = Array.isArray(obj.keyEntities)
    ? obj.keyEntities
        .filter((e): e is string => typeof e === "string" && e.trim().length > 0)
        .map((e) => e.trim())
    : [];

  const articleFacts = Array.isArray(obj.articleFacts)
    ? obj.articleFacts
        .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
        .map((f) => f.trim())
    : claims.map((c) => c.claim);

  const timeline: ResearchTimelineEvent[] = [];
  if (Array.isArray(obj.timeline)) {
    for (const t of obj.timeline) {
      if (t && typeof t === "object") {
        const tObj = t as Record<string, unknown>;
        if (typeof tObj.date === "string" && typeof tObj.event === "string") {
          timeline.push({ date: tObj.date.trim(), event: tObj.event.trim() });
        }
      }
    }
  }

  return {
    mainStory: obj.mainStory.trim(),
    claims,
    keyEntities,
    articleFacts,
    timeline: timeline.length > 0 ? timeline : undefined,
  };
}

/**
 * Validates Step 2 (Search Query Generation) output from Gemini.
 */
export function validateQueryGenerationOutput(data: unknown): QueryGenerationOutput {
  if (!data || typeof data !== "object") {
    throw new ResearchAgentError(
      "INVALID_LLM_OUTPUT",
      "Query generation output is not a valid JSON object.",
      502
    );
  }

  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.queries)) {
    throw new ResearchAgentError(
      "INVALID_LLM_OUTPUT",
      "Query generation output is missing 'queries' array.",
      502
    );
  }

  const queries = obj.queries
    .filter((q): q is string => typeof q === "string" && q.trim().length >= 3)
    .map((q) => q.trim());

  if (queries.length === 0) {
    throw new ResearchAgentError(
      "INVALID_LLM_OUTPUT",
      "Query generation produced zero valid search queries.",
      502
    );
  }

  return {
    queries,
    rationale: typeof obj.rationale === "string" ? obj.rationale.trim() : undefined,
  };
}

/**
 * Validates Step 4/5 (Evidence Evaluation & Conflict Detection) output from Gemini.
 */
export function validateEvidenceEvaluationOutput(data: unknown): EvidenceEvaluationOutput {
  if (!data || typeof data !== "object") {
    throw new ResearchAgentError(
      "INVALID_LLM_OUTPUT",
      "Evidence evaluation output is not a valid JSON object.",
      502
    );
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.summary !== "string" || !obj.summary.trim()) {
    throw new ResearchAgentError(
      "INVALID_LLM_OUTPUT",
      "Evidence evaluation output is missing a valid 'summary' string.",
      502
    );
  }

  if (!Array.isArray(obj.evaluatedClaims) || obj.evaluatedClaims.length === 0) {
    throw new ResearchAgentError(
      "INVALID_LLM_OUTPUT",
      "Evidence evaluation output is missing 'evaluatedClaims' array.",
      502
    );
  }

  const evaluatedClaims: EvaluatedClaimItem[] = [];
  for (const rawItem of obj.evaluatedClaims) {
    if (!rawItem || typeof rawItem !== "object") {
      throw new ResearchAgentError(
        "INVALID_LLM_OUTPUT",
        "Invalid item in 'evaluatedClaims' array.",
        502
      );
    }

    const item = rawItem as Record<string, unknown>;
    if (typeof item.claim !== "string" || !item.claim.trim()) {
      throw new ResearchAgentError(
        "INVALID_LLM_OUTPUT",
        "Evaluated claim item is missing 'claim' text.",
        502
      );
    }

    if (
      typeof item.status !== "string" ||
      !VALID_CLAIM_STATUSES.has(item.status as ClaimVerificationStatus)
    ) {
      throw new ResearchAgentError(
        "INVALID_LLM_OUTPUT",
        `Invalid claim verification status: ${String(item.status)}`,
        502
      );
    }

    if (typeof item.confidence !== "number" || Number.isNaN(item.confidence)) {
      throw new ResearchAgentError(
        "INVALID_LLM_OUTPUT",
        "Evaluated claim item is missing a numeric 'confidence' score.",
        502
      );
    }

    const confidence = Math.max(0, Math.min(1, Number(item.confidence.toFixed(2))));

    if (typeof item.evidence !== "string" || !item.evidence.trim()) {
      throw new ResearchAgentError(
        "INVALID_LLM_OUTPUT",
        "Evaluated claim item is missing 'evidence' explanation.",
        502
      );
    }

    const sourceUrls = Array.isArray(item.sourceUrls)
      ? item.sourceUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      : [];

    evaluatedClaims.push({
      claim: item.claim.trim(),
      status: item.status as ClaimVerificationStatus,
      confidence,
      evidence: item.evidence.trim(),
      sourceUrls,
      conflict:
        typeof item.conflict === "string" && item.conflict.trim().length > 0
          ? item.conflict.trim()
          : undefined,
      notes:
        typeof item.notes === "string" && item.notes.trim().length > 0
          ? item.notes.trim()
          : undefined,
    });
  }

  const additionalContext = Array.isArray(obj.additionalContext)
    ? obj.additionalContext
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        .map((c) => c.trim())
    : [];

  const timeline: ResearchTimelineEvent[] = [];
  if (Array.isArray(obj.timeline)) {
    for (const t of obj.timeline) {
      if (t && typeof t === "object") {
        const tObj = t as Record<string, unknown>;
        if (
          typeof tObj.date === "string" &&
          tObj.date.trim() &&
          typeof tObj.event === "string" &&
          tObj.event.trim()
        ) {
          timeline.push({ date: tObj.date.trim(), event: tObj.event.trim() });
        }
      }
    }
  }

  const needsMoreResearch =
    typeof obj.needsMoreResearch === "boolean" ? obj.needsMoreResearch : false;

  const followUpFocus = Array.isArray(obj.followUpFocus)
    ? obj.followUpFocus
        .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
        .map((f) => f.trim())
    : undefined;

  return {
    summary: obj.summary.trim(),
    evaluatedClaims,
    additionalContext,
    timeline: timeline.length > 0 ? timeline : undefined,
    needsMoreResearch,
    followUpFocus,
  };
}

/**
 * Validates the final ResearchResult before returning to the client.
 */
export function validateResearchResult(result: ResearchResult): ResearchResult {
  if (!result.articleUrl || !result.summary || !Array.isArray(result.claims)) {
    throw new ResearchAgentError(
      "INVALID_LLM_OUTPUT",
      "Final ResearchResult failed schema validation.",
      502
    );
  }

  for (const claim of result.claims) {
    if (!VALID_CLAIM_STATUSES.has(claim.status)) {
      throw new ResearchAgentError(
        "INVALID_LLM_OUTPUT",
        `Invalid claim status in final ResearchResult: ${claim.status}`,
        502
      );
    }
  }

  return result;
}

export interface CallGeminiOptions<T> {
  prompt: string;
  systemInstruction?: string;
  responseSchema: Record<string, unknown>;
  validator: (parsed: unknown) => T;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Server-side helper to invoke Gemini (`gemini-3.5-flash-lite`) with structured JSON output
 * and runtime schema validation.
 */
export async function callGeminiStructured<T>(options: CallGeminiOptions<T>): Promise<T> {
  const apiKey = (options.apiKey ?? process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new ResearchAgentError(
      "MISSING_GEMINI_KEY",
      "Server configuration error: GEMINI_API_KEY is not configured.",
      500
    );
  }

  const model = (options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL).trim();
  const timeoutMs = options.timeoutMs ?? 45000;
  const fetchImpl = options.fetchFn ?? fetch;

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
          parts: [{ text: options.prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: options.responseSchema,
      },
    };

    if (options.systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: options.systemInstruction }],
      };
    }

    let response: Response | null = null;
    let lastError: Error | null = null;

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
          console.warn(`[Gemini API] 503 high demand spike. Retrying in ${attempt * 1200}ms...`);
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
      throw new ResearchAgentError(
        "GEMINI_ERROR",
        "Gemini API authentication failed. Please verify GEMINI_API_KEY.",
        502
      );
    }

    if (response.status === 429) {
      throw new ResearchAgentError(
        "GEMINI_ERROR",
        "Gemini API rate limit reached. Please try again shortly.",
        429
      );
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new ResearchAgentError(
        "GEMINI_ERROR",
        `Gemini API returned HTTP ${response.status}${errText ? `: ${errText.slice(0, 120)}` : ""}.`,
        502
      );
    }

    const payload = await response.json().catch(() => null);
    const candidateText =
      payload?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof candidateText !== "string" || !candidateText.trim()) {
      throw new ResearchAgentError(
        "INVALID_LLM_OUTPUT",
        "Gemini response did not contain structured text content.",
        502
      );
    }

    const parsed = parseStructuredJson(candidateText);
    return options.validator(parsed);
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    if (err instanceof ResearchAgentError) {
      throw err;
    }

    if (err instanceof Error && err.name === "AbortError") {
      throw new ResearchAgentError(
        "GEMINI_TIMEOUT",
        "Gemini request timed out while analyzing the article.",
        504
      );
    }

    const message = err instanceof Error ? err.message : String(err);
    throw new ResearchAgentError(
      "GEMINI_ERROR",
      `Failed to communicate with Gemini: ${message}`,
      502
    );
  }
}

/**
 * Computes overall research confidence from individual claim statuses and confidence scores.
 */
export function calculateOverallConfidence(claims: ResearchClaim[]): number {
  if (claims.length === 0) return 0;

  let weightedSum = 0;
  for (const c of claims) {
    if (c.status === "verified") {
      weightedSum += c.confidence;
    } else if (c.status === "partially_verified") {
      weightedSum += c.confidence * 0.7;
    } else if (c.status === "contradicted") {
      weightedSum += c.confidence * 0.25;
    } else {
      // unverified
      weightedSum += 0;
    }
  }

  return Number(Math.max(0, Math.min(1, weightedSum / claims.length)).toFixed(2));
}

