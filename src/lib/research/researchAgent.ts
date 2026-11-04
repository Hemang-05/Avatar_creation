import { Article } from "@/lib/article/articleTypes";
import { extractClaims } from "./claimExtractor";
import { evaluateEvidence } from "./evidenceEvaluator";
import { generateQueries } from "./queryGenerator";
import {
  EvidenceEvaluationOutput,
  ExtractedClaimItem,
  MAX_RESEARCH_ITERATIONS,
  ResearchAgentError,
  ResearchAgentOptions,
  ResearchApiResponse,
  ResearchClaim,
  ResearchResult,
  ResearchSource,
} from "./researchTypes";
import {
  calculateOverallConfidence,
  filterValidTavilyUrls,
  normalizeUrlForComparison,
  validateArticleInput,
  validateResearchResult,
} from "./researchUtils";
import { searchTavily } from "./tavilySearch";

/**
 * Merges new Tavily sources into the existing source list without duplicates.
 */
function mergeSources(
  existing: ResearchSource[],
  incoming: ResearchSource[]
): ResearchSource[] {
  const map = new Map<string, ResearchSource>();
  for (const s of existing) {
    const key = normalizeUrlForComparison(s.url);
    if (key) map.set(key, s);
  }
  for (const s of incoming) {
    const key = normalizeUrlForComparison(s.url);
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || (s.score ?? 0) > (prev.score ?? 0)) {
      map.set(key, s);
    }
  }
  return Array.from(map.values());
}

/**
 * Orchestrates the complete Phase 3 Research Agent pipeline:
 * 1. Validate Article & API Keys
 * 2. Step 1: Extract meaningful claims via Gemini 3.5 Flash-Lite
 * 3. Iterative Research Loop (up to MAX_RESEARCH_ITERATIONS):
 *    - Step 2: Generate targeted search queries via Gemini
 *    - Step 3: Retrieve web sources via Tavily Search
 *    - Step 4 & 5: Evaluate evidence & detect conflicts via Gemini
 *    - Step 6: Decide whether another research pass is needed for unresolved claims
 * 4. Step 7: Build & validate the final ResearchResult
 */
export async function researchArticle(
  articleInput: Article,
  options: ResearchAgentOptions = {}
): Promise<ResearchResult> {
  const validation = validateArticleInput(articleInput);
  if (!validation.isValid || !validation.article) {
    throw new ResearchAgentError(
      "INVALID_ARTICLE",
      validation.reason || "Invalid article supplied for research.",
      400
    );
  }

  const article = validation.article;

  const geminiKey = (options.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "").trim();
  if (!geminiKey) {
    throw new ResearchAgentError(
      "MISSING_GEMINI_KEY",
      "Server configuration error: GEMINI_API_KEY is not configured.",
      500
    );
  }

  const tavilyKey = (options.tavilyApiKey ?? process.env.TAVILY_API_KEY ?? "").trim();
  if (!tavilyKey) {
    throw new ResearchAgentError(
      "MISSING_TAVILY_KEY",
      "Server configuration error: TAVILY_API_KEY is not configured.",
      500
    );
  }

  const maxIterations = Math.max(
    1,
    Math.min(5, options.maxIterations ?? MAX_RESEARCH_ITERATIONS)
  );

  console.log(`[Research] Starting research agent for: ${article.url}`);

  // Step 1: Analyze article and extract claims
  const analysis = await extractClaims(article, options);
  console.log(
    `[Research] Extracted ${analysis.claims.length} claims and ${analysis.keyEntities.length} entities.`
  );

  let accumulatedSources: ResearchSource[] = [];
  const executedQueries: string[] = [];
  let latestEvaluation: EvidenceEvaluationOutput | null = null;
  let iterationsCompleted = 0;
  let claimsForCurrentIteration: ExtractedClaimItem[] = analysis.claims;
  let followUpFocus: string[] | undefined = undefined;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    iterationsCompleted = iteration;
    console.log(`[Research] Iteration ${iteration}/${maxIterations} started.`);

    // Step 2: Generate search queries for claims needing verification
    const queryResult = await generateQueries(
      {
        articleTitle: article.title,
        mainStory: analysis.mainStory,
        claims: claimsForCurrentIteration,
        iteration,
        previousQueries: executedQueries,
        followUpFocus,
      },
      options
    );

    executedQueries.push(...queryResult.queries);
    console.log(
      `[Research] Iteration ${iteration} generated ${queryResult.queries.length} queries:`,
      queryResult.queries
    );

    // Step 3: Execute Tavily web search
    const newSources = await searchTavily(queryResult.queries, options);
    accumulatedSources = mergeSources(accumulatedSources, newSources);
    console.log(
      `[Research] Iteration ${iteration} retrieved ${newSources.length} sources (${accumulatedSources.length} total unique).`
    );

    // Step 4 & 5: Evaluate evidence and detect conflicts across all claims using accumulated sources
    latestEvaluation = await evaluateEvidence(
      {
        articleTitle: article.title,
        articleUrl: article.url,
        mainStory: analysis.mainStory,
        claims: analysis.claims,
        sources: accumulatedSources,
      },
      options
    );

    // Step 6: Check if additional research iteration is needed and allowed
    const unresolvedClaimsText = new Set(
      latestEvaluation.evaluatedClaims
        .filter((c) => c.status === "unverified" || c.status === "partially_verified")
        .map((c) => c.claim.toLowerCase())
    );

    const remainingVerifiableClaims = analysis.claims.filter(
      (c) => c.requiresVerification && unresolvedClaimsText.has(c.claim.toLowerCase())
    );

    const shouldContinue =
      iteration < maxIterations &&
      latestEvaluation.needsMoreResearch &&
      remainingVerifiableClaims.length > 0;

    if (!shouldContinue) {
      console.log(
        `[Research] Stopping after iteration ${iteration} (needsMoreResearch=${latestEvaluation.needsMoreResearch}, unresolvedVerifiable=${remainingVerifiableClaims.length}).`
      );
      break;
    }

    claimsForCurrentIteration = remainingVerifiableClaims;
    followUpFocus =
      latestEvaluation.followUpFocus && latestEvaluation.followUpFocus.length > 0
        ? latestEvaluation.followUpFocus
        : remainingVerifiableClaims.map((c) => c.claim);
  }

  // Fallback if loop somehow produced no evaluation
  const finalEval: EvidenceEvaluationOutput = latestEvaluation ?? {
    summary: analysis.mainStory,
    evaluatedClaims: analysis.claims.map((c) => ({
      claim: c.claim,
      status: "unverified",
      confidence: 0,
      evidence: "Unable to complete external verification.",
      sourceUrls: [],
    })),
    additionalContext: [],
    needsMoreResearch: false,
  };

  // Step 7: Build final ResearchResult with strict Tavily URL filtering
  const finalClaims: ResearchClaim[] = finalEval.evaluatedClaims.map((c, idx) => ({
    id: `claim_${idx + 1}`,
    claim: c.claim,
    status: c.status,
    confidence: c.confidence,
    evidence: c.evidence,
    sourceUrls: filterValidTavilyUrls(c.sourceUrls, accumulatedSources),
    conflict: c.conflict,
    notes: c.notes,
  }));

  const verifiedFacts = finalClaims
    .filter((c) => c.status === "verified")
    .map((c) => c.claim);

  const unverifiedClaims = finalClaims
    .filter((c) => c.status === "unverified")
    .map((c) => c.claim);

  const overallConfidence = calculateOverallConfidence(finalClaims);

  const result: ResearchResult = {
    articleUrl: article.url,
    articleTitle: article.title,
    summary: finalEval.summary,
    claims: finalClaims,
    keyEntities: analysis.keyEntities,
    timeline:
      finalEval.timeline && finalEval.timeline.length > 0
        ? finalEval.timeline
        : analysis.timeline,
    context: finalEval.additionalContext,
    articleFacts: analysis.articleFacts,
    verifiedFacts,
    unverifiedClaims,
    sources: accumulatedSources,
    overallConfidence,
    researchIterations: iterationsCompleted,
    researchedAt: new Date().toISOString(),
  };

  return validateResearchResult(result);
}

/**
 * Safe wrapper that returns a structured ResearchApiResponse without throwing.
 */
export async function researchArticleSafe(
  articleInput: unknown,
  options: ResearchAgentOptions = {}
): Promise<ResearchApiResponse> {
  const validation = validateArticleInput(articleInput);
  if (!validation.isValid || !validation.article) {
    return {
      success: false,
      error: {
        code: "INVALID_ARTICLE",
        message: validation.reason || "Please provide a valid extracted article object.",
      },
    };
  }

  try {
    const research = await researchArticle(validation.article, options);
    return {
      success: true,
      research,
    };
  } catch (err: unknown) {
    if (err instanceof ResearchAgentError) {
      return {
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      };
    }

    const message = err instanceof Error ? err.message : "An unexpected error occurred during research.";
    return {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message,
      },
    };
  }
}

