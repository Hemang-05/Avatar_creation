/**
 * Phase 4: News Presenter Script Generation Types and Constants
 */

export type ScriptSegmentType =
  | "hook"
  | "story"
  | "context"
  | "significance"
  | "closing";

export type ScriptTone = "professional" | "energetic" | "neutral";

export interface ScriptSegment {
  id: string;
  type: ScriptSegmentType;
  text: string;
  estimatedDurationSeconds: number;
  claimIds: string[];
}

export interface NewsScript {
  title: string;
  hook: string;
  segments: ScriptSegment[];
  fullScript: string;

  wordCount: number;
  estimatedDurationSeconds: number;

  tone: ScriptTone;

  usedClaimIds: string[];
  excludedClaimIds: string[];

  generatedAt: string;
}

export type ScriptErrorCode =
  | "INVALID_RESEARCH"
  | "MISSING_GEMINI_KEY"
  | "GEMINI_TIMEOUT"
  | "GEMINI_RATE_LIMIT"
  | "INVALID_LLM_OUTPUT"
  | "SCRIPT_VALIDATION_ERROR"
  | "GEMINI_ERROR"
  | "INTERNAL_ERROR";

export interface ScriptApiError {
  code: ScriptErrorCode;
  message: string;
}

export interface ScriptSuccessResponse {
  success: true;
  script: NewsScript;
}

export interface ScriptErrorResponse {
  success: false;
  error: ScriptApiError;
}

export type ScriptApiResponse = ScriptSuccessResponse | ScriptErrorResponse;

export class ScriptGeneratorError extends Error {
  public readonly code: ScriptErrorCode;
  public readonly statusCode: number;

  constructor(code: ScriptErrorCode, message: string, statusCode = 500) {
    super(message);
    this.name = "ScriptGeneratorError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface ScriptGenerationOptions {
  geminiApiKey?: string;
  geminiModel?: string;
  geminiTimeoutMs?: number;
  fetchFn?: typeof fetch;
  tone?: ScriptTone;
}

