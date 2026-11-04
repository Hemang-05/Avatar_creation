import { Article } from "@/lib/article/articleTypes";
import { ArticleAnalysisOutput, ResearchAgentOptions } from "./researchTypes";
import { callGeminiStructured, validateArticleAnalysisOutput } from "./researchUtils";

const CLAIM_EXTRACTION_SCHEMA = {
  type: "OBJECT",
  properties: {
    mainStory: {
      type: "STRING",
      description: "A concise 1-2 sentence summary of the main news story.",
    },
    claims: {
      type: "ARRAY",
      description:
        "Prioritized list of 3 to 8 meaningful factual claims from the article (scores, statistics, key events, announcements, dates).",
      items: {
        type: "OBJECT",
        properties: {
          claim: {
            type: "STRING",
            description: "Clear, standalone factual statement to verify.",
          },
          requiresVerification: {
            type: "BOOLEAN",
            description:
              "True if this is an important factual claim requiring external verification; false if purely contextual.",
          },
          category: {
            type: "STRING",
            enum: ["score_stat", "event", "entity", "date", "quote", "context"],
          },
        },
        required: ["claim", "requiresVerification", "category"],
      },
    },
    keyEntities: {
      type: "ARRAY",
      description: "Important people, athletes, teams, organizations, and competitions.",
      items: { type: "STRING" },
    },
    articleFacts: {
      type: "ARRAY",
      description: "Key facts directly stated in the original article.",
      items: { type: "STRING" },
    },
    timeline: {
      type: "ARRAY",
      description: "Chronological dates or milestones mentioned in the article.",
      items: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING" },
          event: { type: "STRING" },
        },
        required: ["date", "event"],
      },
    },
  },
  required: ["mainStory", "claims", "keyEntities", "articleFacts"],
};

/**
 * Step 1 — Analyze Article & Identify Meaningful Factual Claims using Gemini 3.5 Flash-Lite.
 */
export async function extractClaims(
  article: Article,
  options: ResearchAgentOptions = {}
): Promise<ArticleAnalysisOutput> {
  const truncatedContent = article.content.slice(0, 12000);

  const prompt = `Analyze the following news article and extract its core factual claims for editorial verification.

Do NOT verify every trivial sentence. Prioritize the 3 to 8 most important factual claims such as:
- Final scores, match results, or key statistics
- Specific player/person achievements or milestones
- Official announcements (e.g., retirements, transfers, rulings, tournament outcomes)
- Important dates, venues, and organizational events
- Distinguish between concrete factual claims that require verification (requiresVerification: true) and general background/contextual statements (requiresVerification: false).

Article Metadata:
- Title: ${article.title}
- URL: ${article.url}
- Source: ${article.source || "Unknown"}
- Author: ${article.author || "Unknown"}
- Published At: ${article.publishedAt || "Unknown"}

Article Content:
"""
${truncatedContent}
"""`;

  return callGeminiStructured<ArticleAnalysisOutput>({
    prompt,
    systemInstruction:
      "You are a senior newsroom fact-checking editor. Extract clear, atomic, verifiable claims and key entities from news articles in strict JSON format.",
    responseSchema: CLAIM_EXTRACTION_SCHEMA,
    validator: validateArticleAnalysisOutput,
    apiKey: options.geminiApiKey,
    model: options.geminiModel,
    timeoutMs: options.geminiTimeoutMs,
    fetchFn: options.fetchFn,
  });
}

