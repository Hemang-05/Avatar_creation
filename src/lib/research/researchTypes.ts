/**
 * Phase 3: Research Agent Types, Schemas, and Configuration Constants
 */

export const MAX_RESEARCH_ITERATIONS = 2;

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

export type ClaimVerificationStatus =
  | "verified"
  | "partially_verified"
  | "contradicted"
  | "unverified";

export interface ResearchSource {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  content?: string;
  score?: number;
  query?: string;
}

export interface ResearchTimelineEvent {
  date: string;
  event: string;
}

export interface ResearchClaim {
  id?: string;
  claim: string;
  status: ClaimVerificationStatus;
  confidence: number;
  evidence: string;
  sourceUrls: string[];
  conflict?: string;
  notes?: string;
}

export interface ResearchResult {
  articleUrl: string;
  articleTitle?: string;
  summary: string;
  claims: ResearchClaim[];
  keyEntities: string[];
  timeline?: ResearchTimelineEvent[];
  context?: string[];
  articleFacts?: string[];
  verifiedFacts?: string[];
  unverifiedClaims?: string[];
  sources: ResearchSource[];
  overallConfidence: number;
  researchIterations: number;
  researchedAt: string;
}

/**
 * Step 1 internal output from Claim Extractor
 */
export interface ExtractedClaimItem {
  claim: string;
  requiresVerification: boolean;
  category?: "score_stat" | "event" | "entity" | "date" | "quote" | "context";
}

export interface ArticleAnalysisOutput {
  mainStory: string;
  claims: ExtractedClaimItem[];
  keyEntities: string[];
  articleFacts: string[];
  timeline?: ResearchTimelineEvent[];
}

/**
 * Step 2 internal output from Query Generator
 */
export interface QueryGenerationOutput {
  queries: string[];
  rationale?: string;
}

/**
 * Step 4/5 internal output from Evidence Evaluator
 */
export interface EvaluatedClaimItem {
  claim: string;
  status: ClaimVerificationStatus;
  confidence: number;
  evidence: string;
  sourceUrls: string[];
  conflict?: string;
  notes?: string;
}

export interface EvidenceEvaluationOutput {
  summary: string;
  evaluatedClaims: EvaluatedClaimItem[];
  additionalContext: string[];
  timeline?: ResearchTimelineEvent[];
  needsMoreResearch: boolean;
  followUpFocus?: string[];
}

/**
 * Error handling and API response types
 */
export type ResearchErrorCode =
  | "INVALID_ARTICLE"
  | "MISSING_GEMINI_KEY"
  | "MISSING_TAVILY_KEY"
  | "GEMINI_TIMEOUT"
  | "TAVILY_TIMEOUT"
  | "TAVILY_RATE_LIMIT"
  | "INVALID_LLM_OUTPUT"
  | "GEMINI_ERROR"
  | "TAVILY_ERROR"
  | "INTERNAL_ERROR";

export interface ResearchApiError {
  code: ResearchErrorCode;
  message: string;
}

export interface ResearchSuccessResponse {
  success: true;
  research: ResearchResult;
}

export interface ResearchErrorResponse {
  success: false;
  error: ResearchApiError;
}

export type ResearchApiResponse = ResearchSuccessResponse | ResearchErrorResponse;

export class ResearchAgentError extends Error {
  public readonly code: ResearchErrorCode;
  public readonly statusCode: number;

  constructor(code: ResearchErrorCode, message: string, statusCode = 500) {
    super(message);
    this.name = "ResearchAgentError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface ResearchAgentOptions {
  maxIterations?: number;
  geminiApiKey?: string;
  tavilyApiKey?: string;
  geminiModel?: string;
  geminiTimeoutMs?: number;
  tavilyTimeoutMs?: number;
  fetchFn?: typeof fetch;
}

