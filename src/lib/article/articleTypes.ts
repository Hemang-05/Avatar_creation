/**
 * Common Article Schema and API Response Types for NewsAI Studio.
 * Both Mozilla Readability and Firecrawl normalize into this exact structure.
 */

export interface Article {
  url: string;
  title: string;
  description?: string;
  author?: string;
  publishedAt?: string;
  source?: string;
  content: string;
  wordCount: number;
}

export type ExtractionMethod = "readability" | "firecrawl";

export interface ArticleApiError {
  code: "INVALID_URL" | "EXTRACTION_FAILED" | "SSRF_BLOCKED" | "UNREACHABLE" | "TIMEOUT" | "INTERNAL_ERROR";
  message: string;
}

export interface ArticleSuccessResponse {
  success: true;
  article: Article;
  extractionMethod: ExtractionMethod;
}

export interface ArticleErrorResponse {
  success: false;
  error: ArticleApiError;
}

export type ArticleExtractResponse = ArticleSuccessResponse | ArticleErrorResponse;
