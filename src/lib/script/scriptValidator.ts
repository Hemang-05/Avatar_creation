import { ResearchResult } from "@/types/research";
import {
  NewsScript,
  ScriptGeneratorError,
  ScriptSegment,
  ScriptSegmentType,
  ScriptTone,
} from "./scriptTypes";
import {
  calculateEstimatedDurationSeconds,
  countWords,
  NormalizedClaim,
} from "./scriptUtils";

const VALID_SEGMENT_TYPES = new Set<ScriptSegmentType>([
  "hook",
  "story",
  "context",
  "significance",
  "closing",
]);

const VALID_TONES = new Set<ScriptTone>(["professional", "energetic", "neutral"]);

/**
 * Validates the raw JSON output from Gemini against the provided ResearchResult,
 * recalculates word count and duration server-side, and guarantees claim traceability.
 */
export function validateAndNormalizeScript(
  raw: unknown,
  research: ResearchResult,
  normalizedClaims: NormalizedClaim[]
): NewsScript {
  if (!raw || typeof raw !== "object") {
    throw new ScriptGeneratorError(
      "INVALID_LLM_OUTPUT",
      "Gemini returned an invalid non-object payload for news script.",
      502
    );
  }

  const obj = raw as Record<string, unknown>;

  // 1. Validate title
  if (typeof obj.title !== "string" || obj.title.trim().length < 3) {
    throw new ScriptGeneratorError(
      "SCRIPT_VALIDATION_ERROR",
      "Script is missing a valid 'title' (must be at least 3 characters).",
      502
    );
  }
  const title = obj.title.trim();

  // 2. Validate hook
  if (typeof obj.hook !== "string" || obj.hook.trim().length < 5) {
    throw new ScriptGeneratorError(
      "SCRIPT_VALIDATION_ERROR",
      "Script is missing a valid 'hook' (must be at least 5 characters).",
      502
    );
  }
  const hook = obj.hook.trim();

  // 3. Validate fullScript
  if (typeof obj.fullScript !== "string" || obj.fullScript.trim().length < 30) {
    throw new ScriptGeneratorError(
      "SCRIPT_VALIDATION_ERROR",
      "Script is missing a valid 'fullScript' body.",
      502
    );
  }
  const fullScript = obj.fullScript.trim();

  // 4. Server-calculated word count & duration (Do not blindly trust LLM values)
  const wordCount = countWords(fullScript);
  if (wordCount < 60 || wordCount > 280) {
    throw new ScriptGeneratorError(
      "SCRIPT_VALIDATION_ERROR",
      `Generated script word count (${wordCount} words) is outside acceptable bounds (60-280 words).`,
      502
    );
  }
  const estimatedDurationSeconds = calculateEstimatedDurationSeconds(wordCount);

  // 5. Tone validation
  const rawTone = typeof obj.tone === "string" ? obj.tone.toLowerCase().trim() : "professional";
  const tone: ScriptTone = VALID_TONES.has(rawTone as ScriptTone)
    ? (rawTone as ScriptTone)
    : "professional";

  // 6. Build index of valid claims & contradicted claims
  const validClaimIdSet = new Set<string>();
  const contradictedClaimIdSet = new Set<string>();
  for (const c of normalizedClaims) {
    validClaimIdSet.add(c.id);
    if (c.status === "contradicted") {
      contradictedClaimIdSet.add(c.id);
    }
  }

  // 7. Validate segments
  if (!Array.isArray(obj.segments) || obj.segments.length === 0) {
    throw new ScriptGeneratorError(
      "SCRIPT_VALIDATION_ERROR",
      "Script must contain an array of at least one presenter segment.",
      502
    );
  }

  const validatedSegments: ScriptSegment[] = [];
  const segmentsUsedClaimIds = new Set<string>();

  for (let idx = 0; idx < obj.segments.length; idx++) {
    const rawSeg = obj.segments[idx];
    if (!rawSeg || typeof rawSeg !== "object") {
      throw new ScriptGeneratorError(
        "SCRIPT_VALIDATION_ERROR",
        `Segment at index ${idx} is not a valid object.`,
        502
      );
    }

    const sObj = rawSeg as Record<string, unknown>;
    const segId =
      typeof sObj.id === "string" && sObj.id.trim()
        ? sObj.id.trim()
        : `seg_${idx + 1}`;

    const rawType = typeof sObj.type === "string" ? sObj.type.toLowerCase().trim() : "story";
    const segType: ScriptSegmentType = VALID_SEGMENT_TYPES.has(rawType as ScriptSegmentType)
      ? (rawType as ScriptSegmentType)
      : "story";

    if (typeof sObj.text !== "string" || !sObj.text.trim()) {
      throw new ScriptGeneratorError(
        "SCRIPT_VALIDATION_ERROR",
        `Segment '${segId}' has empty or invalid spoken text.`,
        502
      );
    }
    const segText = sObj.text.trim();
    const segWords = countWords(segText);
    const segDuration = calculateEstimatedDurationSeconds(segWords);

    // Validate cited claimIds
    const rawClaimIds = Array.isArray(sObj.claimIds) ? sObj.claimIds : [];
    const segClaimIds: string[] = [];

    for (const cid of rawClaimIds) {
      if (typeof cid !== "string") continue;
      const cleanId = cid.trim();
      if (!cleanId) continue;

      if (!validClaimIdSet.has(cleanId)) {
        throw new ScriptGeneratorError(
          "SCRIPT_VALIDATION_ERROR",
          `Segment '${segId}' references unknown research claim ID: '${cleanId}'.`,
          502
        );
      }

      if (contradictedClaimIdSet.has(cleanId)) {
        throw new ScriptGeneratorError(
          "SCRIPT_VALIDATION_ERROR",
          `Segment '${segId}' references contradicted claim '${cleanId}'. Contradicted claims must be excluded.`,
          502
        );
      }

      segClaimIds.push(cleanId);
      segmentsUsedClaimIds.add(cleanId);
    }

    validatedSegments.push({
      id: segId,
      type: segType,
      text: segText,
      estimatedDurationSeconds: segDuration,
      claimIds: segClaimIds,
    });
  }

  // 8. Validate usedClaimIds
  const rawUsed = Array.isArray(obj.usedClaimIds) ? obj.usedClaimIds : [];
  const usedClaimIdsSet = new Set<string>();

  for (const cid of rawUsed) {
    if (typeof cid !== "string") continue;
    const cleanId = cid.trim();
    if (!cleanId) continue;

    if (!validClaimIdSet.has(cleanId)) {
      throw new ScriptGeneratorError(
        "SCRIPT_VALIDATION_ERROR",
        `usedClaimIds references unknown claim ID: '${cleanId}'.`,
        502
      );
    }

    if (contradictedClaimIdSet.has(cleanId)) {
      throw new ScriptGeneratorError(
        "SCRIPT_VALIDATION_ERROR",
        `usedClaimIds includes contradicted claim '${cleanId}'. Contradicted claims must not be used.`,
        502
      );
    }

    usedClaimIdsSet.add(cleanId);
  }

  // Merge any claimIds cited directly in segments
  for (const cid of segmentsUsedClaimIds) {
    usedClaimIdsSet.add(cid);
  }

  // 9. Validate excludedClaimIds
  const rawExcluded = Array.isArray(obj.excludedClaimIds) ? obj.excludedClaimIds : [];
  const excludedClaimIdsSet = new Set<string>();

  for (const cid of rawExcluded) {
    if (typeof cid !== "string") continue;
    const cleanId = cid.trim();
    if (!cleanId) continue;

    if (!validClaimIdSet.has(cleanId)) {
      throw new ScriptGeneratorError(
        "SCRIPT_VALIDATION_ERROR",
        `excludedClaimIds references unknown claim ID: '${cleanId}'.`,
        502
      );
    }

    excludedClaimIdsSet.add(cleanId);
  }

  // Automatically add any research claim not in usedClaimIds into excludedClaimIds
  for (const cid of validClaimIdSet) {
    if (!usedClaimIdsSet.has(cid)) {
      excludedClaimIdsSet.add(cid);
    }
  }

  return {
    title,
    hook,
    segments: validatedSegments,
    fullScript,
    wordCount,
    estimatedDurationSeconds,
    tone,
    usedClaimIds: Array.from(usedClaimIdsSet),
    excludedClaimIds: Array.from(excludedClaimIdsSet),
    generatedAt: new Date().toISOString(),
  };
}

