import {
  EvaluatedClaimItem,
  EvidenceEvaluationOutput,
  ExtractedClaimItem,
  ResearchAgentOptions,
  ResearchSource,
} from "./researchTypes";
import {
  callGeminiStructured,
  filterValidTavilyUrls,
  validateEvidenceEvaluationOutput,
} from "./researchUtils";

const EVIDENCE_EVALUATION_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: {
      type: "STRING",
      description:
        "Comprehensive 2-4 sentence summary of the verified story and editorial findings.",
    },
    evaluatedClaims: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          claim: { type: "STRING" },
          status: {
            type: "STRING",
            enum: ["verified", "partially_verified", "contradicted", "unverified"],
          },
          confidence: {
            type: "NUMBER",
            description: "Confidence score between 0.0 and 1.0 based strictly on evidence quality.",
          },
          evidence: {
            type: "STRING",
            description: "Explanation of how the retrieved sources support or contradict the claim.",
          },
          sourceUrls: {
            type: "ARRAY",
            description:
              "Exact URLs from the provided Web Sources list that support or address this claim. Never invent URLs.",
            items: { type: "STRING" },
          },
          conflict: {
            type: "STRING",
            description:
              "If sources disagree with the claim or with each other, describe the conflicting figures or accounts.",
          },
          notes: {
            type: "STRING",
            description: "Optional editorial note on source authority or nuance.",
          },
        },
        required: ["claim", "status", "confidence", "evidence", "sourceUrls"],
      },
    },
    additionalContext: {
      type: "ARRAY",
      description:
        "Useful background facts discovered in external web sources that were not explicitly detailed in the original article.",
      items: { type: "STRING" },
    },
    timeline: {
      type: "ARRAY",
      description: "Verified chronological events and dates relevant to the story.",
      items: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING" },
          event: { type: "STRING" },
        },
        required: ["date", "event"],
      },
    },
    needsMoreResearch: {
      type: "BOOLEAN",
      description:
        "True if one or more high-importance claims remain unverified or lack sufficient evidence and would benefit from another targeted search.",
    },
    followUpFocus: {
      type: "ARRAY",
      description: "Specific unresolved claims or facts that need follow-up search queries.",
      items: { type: "STRING" },
    },
  },
  required: ["summary", "evaluatedClaims", "additionalContext", "needsMoreResearch"],
};

export interface EvaluateEvidenceInput {
  articleTitle: string;
  articleUrl: string;
  mainStory: string;
  claims: ExtractedClaimItem[];
  sources: ResearchSource[];
}

/**
 * Step 4 & Step 5 — Evidence Evaluation & Conflict Detection using Gemini 3.5 Flash-Lite.
 * Enforces strict source URL validation so Gemini can never invent or hallucinate URLs.
 */
export async function evaluateEvidence(
  input: EvaluateEvidenceInput,
  options: ResearchAgentOptions = {}
): Promise<EvidenceEvaluationOutput> {
  // Handle zero search results safely without inventing evidence
  if (!input.sources || input.sources.length === 0) {
    const unverifiedClaims: EvaluatedClaimItem[] = input.claims.map((c) => ({
      claim: c.claim,
      status: "unverified",
      confidence: 0,
      evidence: "No external web search results were found to verify this claim.",
      sourceUrls: [],
    }));

    return {
      summary: `${input.mainStory} (Note: External web search returned no corroborating sources; claims remain unverified.)`,
      evaluatedClaims: unverifiedClaims,
      additionalContext: [],
      needsMoreResearch: true,
      followUpFocus: input.claims.map((c) => c.claim),
    };
  }

  const formattedSources = input.sources
    .map(
      (s, i) =>
        `[Source ${i + 1}]
Title: ${s.title}
URL: ${s.url}
Domain: ${s.domain}
Snippet: ${s.content || s.snippet || "N/A"}`
    )
    .join("\n\n");

  const formattedClaims = input.claims
    .map(
      (c, i) =>
        `${i + 1}. ${c.claim} (Requires verification: ${c.requiresVerification ? "Yes" : "Contextual"})`
    )
    .join("\n");

  const prompt = `Evaluate the following news article claims against the retrieved web search sources.

Article Title: ${input.articleTitle}
Original Article URL: ${input.articleUrl}
Main Story Summary: ${input.mainStory}

Claims to Evaluate:
${formattedClaims}

Retrieved Web Sources (Tavily):
${formattedSources}

Evaluation & Conflict Detection Rules:
1. For each claim, assign one status:
   - "verified": Directly corroborated by reliable external source(s).
   - "partially_verified": Core event is supported, but specific details/numbers are only partially confirmed.
   - "contradicted": External authoritative sources disagree with the claim or report conflicting numbers/facts.
   - "unverified": Insufficient external evidence found in the provided sources.
2. Conflict Detection: If different sources disagree (e.g., Source A reports 13-0 while Source B reports 12-0), DO NOT silently pick one. Mark the status as "contradicted" (or explain the discrepancy) and populate the "conflict" field clearly describing both sides.
3. Source Authority: Prefer primary and authoritative sources (official tournament/league bodies, official team sources, governing federations, major wire services, and reputable news organizations).
4. Strict Source URLs: In "sourceUrls", ONLY include exact URLs from the "Retrieved Web Sources (Tavily)" list above. NEVER invent or guess URLs.
5. Confidence Score: Set "confidence" between 0.0 and 1.0 reflecting the strength, consistency, and authority of the evidence.
6. Set "needsMoreResearch" to true if key claims remain "unverified" or "partially_verified" and could be resolved with a better search query.`;

  const rawEvaluation = await callGeminiStructured<EvidenceEvaluationOutput>({
    prompt,
    systemInstruction:
      "You are an objective fact-checking and conflict-detection agent. Evaluate claims strictly against provided web sources and output structured JSON.",
    responseSchema: EVIDENCE_EVALUATION_SCHEMA,
    validator: validateEvidenceEvaluationOutput,
    apiKey: options.geminiApiKey,
    model: options.geminiModel,
    timeoutMs: options.geminiTimeoutMs,
    fetchFn: options.fetchFn,
  });

  // Strict server-side enforcement: strip any URL not in actual Tavily results
  const sanitizedClaims: EvaluatedClaimItem[] = rawEvaluation.evaluatedClaims.map((item) => {
    const validUrls = filterValidTavilyUrls(item.sourceUrls, input.sources);

    // If LLM claimed verification without any real Tavily URL backing it, downgrade to unverified
    if (
      (item.status === "verified" || item.status === "partially_verified") &&
      validUrls.length === 0
    ) {
      return {
        ...item,
        status: "unverified",
        confidence: 0,
        evidence: `${item.evidence} (Downgraded to unverified: no matching external source URL from search results.)`,
        sourceUrls: [],
      };
    }

    return {
      ...item,
      sourceUrls: validUrls,
    };
  });

  const hasUnresolvedClaims = sanitizedClaims.some(
    (c) => c.status === "unverified" || c.status === "partially_verified"
  );

  return {
    ...rawEvaluation,
    evaluatedClaims: sanitizedClaims,
    needsMoreResearch: rawEvaluation.needsMoreResearch && hasUnresolvedClaims,
  };
}

