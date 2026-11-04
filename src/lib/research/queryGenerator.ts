import {
  ExtractedClaimItem,
  QueryGenerationOutput,
  ResearchAgentOptions,
} from "./researchTypes";
import { callGeminiStructured, validateQueryGenerationOutput } from "./researchUtils";

const QUERY_GENERATION_SCHEMA = {
  type: "OBJECT",
  properties: {
    queries: {
      type: "ARRAY",
      description:
        "1 to 4 highly specific web search queries designed to retrieve authoritative verification for the claims.",
      items: { type: "STRING" },
    },
    rationale: {
      type: "STRING",
      description: "Brief explanation of what evidence these queries target.",
    },
  },
  required: ["queries"],
};

export interface GenerateQueriesInput {
  articleTitle: string;
  mainStory: string;
  claims: ExtractedClaimItem[];
  iteration?: number;
  previousQueries?: string[];
  followUpFocus?: string[];
}

/**
 * Step 2 — Generate targeted web search queries using Gemini 3.5 Flash-Lite.
 */
export async function generateQueries(
  input: GenerateQueriesInput,
  options: ResearchAgentOptions = {}
): Promise<QueryGenerationOutput> {
  const verifiableClaims = input.claims.filter((c) => c.requiresVerification);
  const targetClaims =
    verifiableClaims.length > 0 ? verifiableClaims : input.claims.slice(0, 4);

  const isFollowUp = (input.iteration ?? 1) > 1;
  const previousList =
    input.previousQueries && input.previousQueries.length > 0
      ? `\nPreviously executed queries (DO NOT repeat these; try alternative keywords, entities, or official organization names):\n${input.previousQueries
          .map((q) => `- "${q}"`)
          .join("\n")}`
      : "";

  const focusNote =
    input.followUpFocus && input.followUpFocus.length > 0
      ? `\nSpecific unresolved gaps to verify in this iteration:\n${input.followUpFocus
          .map((f) => `- ${f}`)
          .join("\n")}`
      : "";

  const prompt = `Generate 1 to 4 targeted, high-precision web search queries to verify the following factual claims from a news story.

Article Title: ${input.articleTitle}
Main Story: ${input.mainStory}
Research Iteration: ${input.iteration ?? 1}

Claims requiring verification:
${targetClaims.map((c, idx) => `${idx + 1}. [${c.category || "fact"}] ${c.claim}`).join("\n")}
${previousList}${focusNote}

Guidelines:
- Make queries specific enough to retrieve authoritative sources (official federations, tournament bodies, team records, reputable wire agencies).
- Group closely related statistics from the same match/event into efficient queries where possible so we do not run redundant searches.
- Produce between 1 and 4 search queries.${
    isFollowUp
      ? "\n- Since this is a follow-up iteration, broaden or refine entity names and dates to resolve remaining unverified claims."
      : ""
  }`;

  const result = await callGeminiStructured<QueryGenerationOutput>({
    prompt,
    systemInstruction:
      "You are a research investigator generating concise, high-signal search engine queries to verify news claims.",
    responseSchema: QUERY_GENERATION_SCHEMA,
    validator: validateQueryGenerationOutput,
    apiKey: options.geminiApiKey,
    model: options.geminiModel,
    timeoutMs: options.geminiTimeoutMs,
    fetchFn: options.fetchFn,
  });

  // Deduplicate and cap at 4 queries per iteration to prevent excessive API calls
  const prevSet = new Set(
    (input.previousQueries ?? []).map((q) => q.trim().toLowerCase())
  );
  const uniqueQueries: string[] = [];
  for (const q of result.queries) {
    const lower = q.trim().toLowerCase();
    if (!prevSet.has(lower) && !uniqueQueries.some((u) => u.toLowerCase() === lower)) {
      uniqueQueries.push(q.trim());
    }
  }

  // Fallback if all generated queries matched previous ones
  const finalQueries =
    uniqueQueries.length > 0 ? uniqueQueries.slice(0, 4) : result.queries.slice(0, 4);

  return {
    queries: finalQueries,
    rationale: result.rationale,
  };
}

