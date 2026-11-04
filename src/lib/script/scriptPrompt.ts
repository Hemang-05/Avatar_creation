import { ResearchResult } from "@/types/research";
import { categorizeClaims, NormalizedClaim } from "./scriptUtils";
import { ScriptTone } from "./scriptTypes";

export const SCRIPT_GENERATION_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: {
      type: "STRING",
      description: "Punchy, broadcast-style headline for the news story (5-12 words).",
    },
    hook: {
      type: "STRING",
      description:
        "Attention-grabbing opening sentence delivered directly to the viewer. Never use filler greetings.",
    },
    segments: {
      type: "ARRAY",
      description:
        "Ordered list of presenter script segments following the broadcast narrative arc (hook, story, context, significance, closing).",
      items: {
        type: "OBJECT",
        properties: {
          id: {
            type: "STRING",
            description: "Segment identifier, e.g., 'seg_1', 'seg_2'.",
          },
          type: {
            type: "STRING",
            enum: ["hook", "story", "context", "significance", "closing"],
          },
          text: {
            type: "STRING",
            description: "The exact words spoken aloud by the news presenter for this segment.",
          },
          claimIds: {
            type: "ARRAY",
            description:
              "IDs of the verified research claims directly reflected or cited in this segment. Must come strictly from the provided Claim IDs.",
            items: { type: "STRING" },
          },
        },
        required: ["id", "type", "text", "claimIds"],
      },
    },
    fullScript: {
      type: "STRING",
      description:
        "The complete, uninterrupted broadcast presenter script combining all segments in order. Length must be between 110 and 190 words.",
    },
    tone: {
      type: "STRING",
      enum: ["professional", "energetic", "neutral"],
      description: "Editorial broadcast tone used in the delivery.",
    },
    usedClaimIds: {
      type: "ARRAY",
      description: "List of research claim IDs incorporated into the final presenter script.",
      items: { type: "STRING" },
    },
    excludedClaimIds: {
      type: "ARRAY",
      description:
        "List of research claim IDs that were omitted (including all contradicted or unverified claims).",
      items: { type: "STRING" },
    },
  },
  required: [
    "title",
    "hook",
    "segments",
    "fullScript",
    "tone",
    "usedClaimIds",
    "excludedClaimIds",
  ],
};

export interface BuildPromptParams {
  research: ResearchResult;
  normalizedClaims: NormalizedClaim[];
  tone?: ScriptTone;
}

export function buildScriptPrompt({
  research,
  normalizedClaims,
  tone = "professional",
}: BuildPromptParams): { prompt: string; systemInstruction: string } {
  const {
    verifiedClaims,
    partiallyVerifiedClaims,
    contradictedClaims,
    unverifiedClaims,
  } = categorizeClaims(normalizedClaims);

  const formatClaimBlock = (c: NormalizedClaim) =>
    `- [ID: ${c.id}] Status: ${c.status.toUpperCase()} (Confidence: ${Math.round(
      c.confidence * 100
    )}%)\n  Claim: "${c.claim}"\n  Evidence: ${c.evidence}${
      c.conflict ? `\n  Conflict/Discrepancy: ${c.conflict}` : ""
    }`;

  const verifiedSection =
    verifiedClaims.length > 0
      ? verifiedClaims.map(formatClaimBlock).join("\n")
      : "None";

  const partiallyVerifiedSection =
    partiallyVerifiedClaims.length > 0
      ? partiallyVerifiedClaims.map(formatClaimBlock).join("\n")
      : "None";

  const contradictedSection =
    contradictedClaims.length > 0
      ? contradictedClaims.map(formatClaimBlock).join("\n")
      : "None";

  const unverifiedSection =
    unverifiedClaims.length > 0
      ? unverifiedClaims.map(formatClaimBlock).join("\n")
      : "None";

  const timelineSection =
    research.timeline && research.timeline.length > 0
      ? research.timeline.map((t) => `- ${t.date}: ${t.event}`).join("\n")
      : "None";

  const contextSection =
    research.context && research.context.length > 0
      ? research.context.map((c) => `- ${c}`).join("\n")
      : "None";

  const systemInstruction = `You are a professional broadcast news script writer for an AI television presenter.
Your job is to transform verified editorial research into a punchy, spoken news broadcast script.

STRICT ACCURACY RULES:
1. SOURCE OF TRUTH: The supplied ResearchResult is your ONLY source of truth. Do NOT use outside world knowledge.
2. DO NOT INVENT: Never invent facts, statistics, quotes, names, dates, scores, or explanations.
3. CLAIM TRACEABILITY: Every factual segment must explicitly reference the specific claim IDs it covers in "claimIds".
4. SAFE CLAIMS: Freely use VERIFIED claims.
5. CAREFUL CLAIMS: PARTIALLY VERIFIED claims may only be used with careful, measured wording (e.g. "reports indicate...").
6. EXCLUDED CLAIMS: CONTRADICTED claims and UNVERIFIED claims MUST NEVER be presented as fact. They must be listed in "excludedClaimIds".
7. NO META-COMMENTARY: Never write "In this video...", "Welcome back...", "Hello everyone...", or "According to the research...". Speak as an active news anchor delivering live news.
8. SCRIPT LENGTH: Target 120-180 words (absolute hard limits: 90-220 words).`;

  const prompt = `Write a broadcast-ready news presenter script based STRICTLY on the research below.

Editorial Target:
- Tone: ${tone}
- Desired Word Count: 120 to 180 words (spoken at ~150 words/min, roughly 50-75 seconds of airtime).

Story Overview:
- Story Title: ${research.articleTitle || "News Story"}
- Research Summary: ${research.summary}

VERIFIED CLAIMS (Safe to use as facts):
${verifiedSection}

PARTIALLY VERIFIED CLAIMS (Use cautiously if relevant):
${partiallyVerifiedSection}

EXCLUDED CONTRADICTED CLAIMS (DO NOT present as facts - must be omitted or cited only as disputed):
${contradictedSection}

EXCLUDED UNVERIFIED CLAIMS (DO NOT present as facts):
${unverifiedSection}

Additional Context & Background:
${contextSection}

Chronological Timeline:
${timelineSection}

Presenter Narrative Structure:
1. HOOK: Immediately start with the biggest development. Grab the audience in sentence 1.
2. WHAT HAPPENED: Clear delivery of the core confirmed event and primary numbers.
3. KEY DETAILS: Supporting milestones, player/entity actions, or outcomes.
4. CONTEXT / SIGNIFICANCE: Why this matters in the broader competition or landscape.
5. CLOSING: Brief, definitive broadcast sign-off.

Output must be in structured JSON conforming to the schema. Ensure all cited claim IDs exist in the research above.`;

  return { prompt, systemInstruction };
}

