import { ResearchClaim, ResearchResult } from "@/types/research";
import { ScriptGeneratorError } from "./scriptTypes";

/**
 * Accurately counts words in spoken text/script, stripping excessive punctuation and whitespace.
 */
export function countWords(text: string): number {
  if (!text || typeof text !== "string") return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Calculates broadcast presenter speaking duration at standard 150 words per minute.
 * estimatedDurationSeconds = Math.round((wordCount / 150) * 60)
 */
export function calculateEstimatedDurationSeconds(wordCount: number): number {
  if (wordCount <= 0) return 0;
  return Math.max(1, Math.round((wordCount / 150) * 60));
}

export interface NormalizedClaim extends ResearchClaim {
  id: string;
}

/**
 * Normalizes claims in ResearchResult to guarantee each claim has a deterministic unique ID
 * (e.g., 'claim_1', 'claim_2') if not already assigned.
 */
export function normalizeResearchClaims(research: ResearchResult): {
  normalizedClaims: NormalizedClaim[];
  claimMap: Map<string, NormalizedClaim>;
  validClaimIdSet: Set<string>;
} {
  const normalizedClaims: NormalizedClaim[] = [];
  const claimMap = new Map<string, NormalizedClaim>();
  const validClaimIdSet = new Set<string>();

  const rawClaims = Array.isArray(research.claims) ? research.claims : [];

  for (let idx = 0; idx < rawClaims.length; idx++) {
    const raw = rawClaims[idx];
    const claimId =
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim()
        : `claim_${idx + 1}`;

    const normalized: NormalizedClaim = {
      ...raw,
      id: claimId,
    };

    normalizedClaims.push(normalized);
    claimMap.set(claimId, normalized);
    validClaimIdSet.add(claimId);
  }

  return { normalizedClaims, claimMap, validClaimIdSet };
}

/**
 * Validates that an incoming request contains a usable ResearchResult.
 */
export function validateResearchInput(input: unknown): {
  isValid: boolean;
  research?: ResearchResult;
  reason?: string;
} {
  if (!input || typeof input !== "object") {
    return { isValid: false, reason: "Research payload must be a valid JSON object." };
  }

  const candidate = input as Record<string, unknown>;

  if (typeof candidate.articleUrl !== "string" || !candidate.articleUrl.trim()) {
    return { isValid: false, reason: "ResearchResult is missing 'articleUrl'." };
  }

  if (typeof candidate.summary !== "string" || !candidate.summary.trim()) {
    return { isValid: false, reason: "ResearchResult is missing 'summary'." };
  }

  if (!Array.isArray(candidate.claims) || candidate.claims.length === 0) {
    return {
      isValid: false,
      reason: "ResearchResult must contain at least one research claim.",
    };
  }

  const validStatuses = new Set([
    "verified",
    "partially_verified",
    "contradicted",
    "unverified",
  ]);

  for (let i = 0; i < candidate.claims.length; i++) {
    const c = candidate.claims[i];
    if (!c || typeof c !== "object") {
      return { isValid: false, reason: `Claim at index ${i} is not a valid object.` };
    }
    const cObj = c as Record<string, unknown>;
    if (typeof cObj.claim !== "string" || !cObj.claim.trim()) {
      return { isValid: false, reason: `Claim at index ${i} is missing 'claim' text.` };
    }
    if (typeof cObj.status !== "string" || !validStatuses.has(cObj.status)) {
      return {
        isValid: false,
        reason: `Claim at index ${i} has an invalid status: ${String(cObj.status)}.`,
      };
    }
  }

  return {
    isValid: true,
    research: candidate as unknown as ResearchResult,
  };
}

/**
 * Groups claims by safety and suitability for script generation:
 * - verified: safe, factual
 * - partially_verified: carefully usable with cautious phrasing
 * - contradicted: EXCLUDED (must not be presented as fact)
 * - unverified: EXCLUDED (must not be presented as fact)
 */
export function categorizeClaims(claims: NormalizedClaim[]): {
  verifiedClaims: NormalizedClaim[];
  partiallyVerifiedClaims: NormalizedClaim[];
  contradictedClaims: NormalizedClaim[];
  unverifiedClaims: NormalizedClaim[];
  safeClaimIds: Set<string>;
  excludedClaimIds: Set<string>;
} {
  const verifiedClaims: NormalizedClaim[] = [];
  const partiallyVerifiedClaims: NormalizedClaim[] = [];
  const contradictedClaims: NormalizedClaim[] = [];
  const unverifiedClaims: NormalizedClaim[] = [];
  const safeClaimIds = new Set<string>();
  const excludedClaimIds = new Set<string>();

  for (const c of claims) {
    if (c.status === "verified") {
      verifiedClaims.push(c);
      safeClaimIds.add(c.id);
    } else if (c.status === "partially_verified") {
      partiallyVerifiedClaims.push(c);
      safeClaimIds.add(c.id);
    } else if (c.status === "contradicted") {
      contradictedClaims.push(c);
      excludedClaimIds.add(c.id);
    } else {
      unverifiedClaims.push(c);
      excludedClaimIds.add(c.id);
    }
  }

  return {
    verifiedClaims,
    partiallyVerifiedClaims,
    contradictedClaims,
    unverifiedClaims,
    safeClaimIds,
    excludedClaimIds,
  };
}

/**
 * Parses raw Gemini JSON output into an object and handles formatting blocks.
 */
export function parseStructuredScriptJson(rawText: string): unknown {
  if (!rawText || typeof rawText !== "string") {
    throw new ScriptGeneratorError(
      "INVALID_LLM_OUTPUT",
      "Gemini returned an empty response instead of structured script JSON.",
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
    throw new ScriptGeneratorError(
      "INVALID_LLM_OUTPUT",
      "Gemini returned malformed JSON that failed script schema parsing.",
      502
    );
  }
}

