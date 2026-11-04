import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResearchResult } from "../src/types/research";
import { generateScript, generateScriptSafe } from "../src/lib/script/scriptGenerator";
import { countWords, calculateEstimatedDurationSeconds } from "../src/lib/script/scriptUtils";
import { ScriptResultCard } from "../src/components/chat/ScriptResultCard";
import { ChatMessage } from "../src/components/chat/ChatMessage";
import { Message } from "../src/types/chat";
import { Article } from "../src/lib/article/articleTypes";
import { researchArticle } from "../src/lib/research/researchAgent";

const SAMPLE_RESEARCH_RESULT: ResearchResult = {
  articleUrl: "https://example-sports-news.com/hockey/india-defeats-bangladesh-13-0",
  articleTitle: "India Defeats Bangladesh 13-0 in Asian Champions Trophy Opener",
  summary:
    "Defending champions India opened their Asian Champions Trophy 2026 campaign in Punjab with a 13-0 win against Bangladesh, led by two goals each from Harmanpreet Singh and Mandeep Singh.",
  claims: [
    {
      id: "claim_1",
      claim: "India defeated Bangladesh 13-0 in their opening match of the Asian Champions Trophy 2026.",
      status: "verified",
      confidence: 1.0,
      evidence: "Confirmed by official FIH TMS match record and tournament reports.",
      sourceUrls: ["https://tms.fih.ch/matches/23226"],
    },
    {
      id: "claim_2",
      claim: "Harmanpreet Singh scored two goals.",
      status: "verified",
      confidence: 0.95,
      evidence: "FIH match sheet records goals in the 2nd and 44th minutes.",
      sourceUrls: ["https://tms.fih.ch/matches/23226"],
    },
    {
      id: "claim_3",
      claim: "Mandeep Singh scored three goals.",
      status: "contradicted",
      confidence: 0.9,
      evidence: "Official FIH match sheet records Mandeep Singh scored 2 goals, not 3.",
      sourceUrls: ["https://tms.fih.ch/matches/23226"],
      conflict: "Original article stated a hat-trick; official federation sheet credits 2 goals.",
    },
    {
      id: "claim_4",
      claim: "Nilakanta Sharma announced his international retirement.",
      status: "unverified",
      confidence: 0.1,
      evidence: "No post-match press statement or federation bulletin confirmed a retirement announcement.",
      sourceUrls: [],
    },
  ],
  keyEntities: ["India", "Bangladesh", "Harmanpreet Singh", "Mandeep Singh", "Asian Champions Trophy"],
  context: ["India now sits at the top of Pool A with a +13 goal differential."],
  timeline: [{ date: "2026-10-28", event: "India plays Bangladesh in Pool A opening match" }],
  sources: [
    {
      title: "Official Match Sheet FIH",
      url: "https://tms.fih.ch/matches/23226",
      domain: "tms.fih.ch",
    },
  ],
  overallConfidence: 0.74,
  researchIterations: 1,
  researchedAt: "2026-10-28T10:00:00Z",
};

function createGeminiScriptResponse(jsonPayload: unknown, status = 200): Response {
  const textContent =
    typeof jsonPayload === "string" ? jsonPayload : JSON.stringify(jsonPayload);
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: textContent }],
          },
        },
      ],
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

async function runPhase4Tests() {
  console.log("=======================================================");
  console.log("RUNNING PHASE 4 SCRIPT GENERATOR UNIT & INTEGRATION TESTS");
  console.log("=======================================================\n");

  // ---------------------------------------------------------------------------
  // Test 1, 2, 3, 4, 5, 7, 8: Valid research -> NewsScript generated with claim traceability
  // ---------------------------------------------------------------------------
  console.log("[Tests 1, 2, 3, 4, 5, 7, 8] Testing valid script generation, claim traceability, word count & duration...");

  const validScriptPayload = {
    title: "India Dominates Bangladesh in Asian Champions Trophy Opener",
    hook: "Defending champions India launched their Asian Champions Trophy title defense in commanding fashion today, overpowering Bangladesh in a thirteen-nil shutout.",
    segments: [
      {
        id: "seg_1",
        type: "hook",
        text: "Defending champions India launched their Asian Champions Trophy title defense in commanding fashion today, overpowering Bangladesh in a thirteen-nil shutout.",
        claimIds: ["claim_1"],
      },
      {
        id: "seg_2",
        type: "story",
        text: "The Indian squad dictated the tempo from the opening whistle. Captain Harmanpreet Singh led from the front, converting two clinical set-piece goals.",
        claimIds: ["claim_1", "claim_2"],
      },
      {
        id: "seg_3",
        type: "context",
        text: "With this dominant result, India immediately ascends to the summit of Pool A, establishing a plus-thirteen goal differential heading into the next round of fixtures.",
        claimIds: ["claim_1"],
      },
      {
        id: "seg_4",
        type: "closing",
        text: "A resounding statement of intent as India sets the standard for the tournament. Reporting from the news desk, more updates to follow.",
        claimIds: [],
      },
    ],
    fullScript:
      "Defending champions India launched their Asian Champions Trophy title defense in commanding fashion today, overpowering Bangladesh in a thirteen-nil shutout.\n\nThe Indian squad dictated the tempo from the opening whistle. Captain Harmanpreet Singh led from the front, converting two clinical set-piece goals.\n\nWith this dominant result, India immediately ascends to the summit of Pool A, establishing a plus-thirteen goal differential heading into the next round of fixtures.\n\nA resounding statement of intent as India sets the standard for the tournament. Reporting from the news desk, more updates to follow.",
    tone: "professional",
    usedClaimIds: ["claim_1", "claim_2"],
    excludedClaimIds: ["claim_3", "claim_4"],
  };

  const mockFetchValid: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    assert.ok(url.includes("gemini-3.5-flash-lite"), "Must use gemini-3.5-flash-lite");
    return createGeminiScriptResponse(validScriptPayload);
  };

  const scriptResult = await generateScript(SAMPLE_RESEARCH_RESULT, {
    geminiApiKey: "mock-gemini-key",
    fetchFn: mockFetchValid,
  });

  // Test 1: NewsScript returned
  assert.ok(scriptResult, "Test 1: Script must be returned");
  assert.equal(scriptResult.title, validScriptPayload.title);
  assert.equal(scriptResult.tone, "professional");

  // Test 2: Verified claims appear
  assert.ok(
    scriptResult.usedClaimIds.includes("claim_1") && scriptResult.usedClaimIds.includes("claim_2"),
    "Test 2: Verified claims claim_1 and claim_2 must be in usedClaimIds"
  );

  // Test 3: Unverified claim is excluded
  assert.ok(
    scriptResult.excludedClaimIds.includes("claim_4"),
    "Test 3: Unverified claim_4 must be in excludedClaimIds"
  );
  assert.ok(
    !scriptResult.usedClaimIds.includes("claim_4"),
    "Test 3: Unverified claim_4 must NOT be in usedClaimIds"
  );

  // Test 4: Contradicted claim is excluded
  assert.ok(
    scriptResult.excludedClaimIds.includes("claim_3"),
    "Test 4: Contradicted claim_3 must be in excludedClaimIds"
  );
  assert.ok(
    !scriptResult.usedClaimIds.includes("claim_3"),
    "Test 4: Contradicted claim_3 must NOT be in usedClaimIds"
  );

  // Test 5: Claim traceability
  for (const seg of scriptResult.segments) {
    for (const cid of seg.claimIds) {
      assert.ok(
        SAMPLE_RESEARCH_RESULT.claims.some((c) => c.id === cid),
        `Test 5: Claim ID ${cid} must exist in ResearchResult`
      );
    }
  }

  // Test 7: Word count calculated server-side
  const expectedWordCount = countWords(validScriptPayload.fullScript);
  assert.equal(scriptResult.wordCount, expectedWordCount, "Test 7: Word count must be accurately computed");
  assert.ok(scriptResult.wordCount >= 70 && scriptResult.wordCount <= 220);

  // Test 8: Duration calculated server-side
  const expectedDuration = calculateEstimatedDurationSeconds(expectedWordCount);
  assert.equal(scriptResult.estimatedDurationSeconds, expectedDuration, "Test 8: Duration must match word count / 150 * 60");
  console.log("✓ Tests 1, 2, 3, 4, 5, 7, 8 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 6: Invalid claim ID -> validation failure
  // ---------------------------------------------------------------------------
  console.log("[Test 6] Testing rejection of unknown hallucinated claim IDs...");
  const mockFetchBadClaimId: typeof fetch = async () => {
    return createGeminiScriptResponse({
      ...validScriptPayload,
      segments: [
        {
          id: "seg_1",
          type: "hook",
          text: "Headline news.",
          claimIds: ["claim_non_existent_999"],
        },
      ],
      usedClaimIds: ["claim_non_existent_999"],
    });
  };

  const badClaimRes = await generateScriptSafe(SAMPLE_RESEARCH_RESULT, {
    geminiApiKey: "mock-gemini-key",
    fetchFn: mockFetchBadClaimId,
  });

  assert.equal(badClaimRes.success, false);
  if (!badClaimRes.success) {
    assert.equal(badClaimRes.error.code, "SCRIPT_VALIDATION_ERROR");
    assert.ok(badClaimRes.error.message.includes("unknown research claim ID"));
  }
  console.log("✓ Test 6 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 9: Invalid Gemini JSON
  // ---------------------------------------------------------------------------
  console.log("[Test 9] Testing invalid Gemini JSON rejection...");
  const mockFetchBadJson: typeof fetch = async () => {
    return createGeminiScriptResponse("INVALID NOT JSON {[[");
  };

  const badJsonRes = await generateScriptSafe(SAMPLE_RESEARCH_RESULT, {
    geminiApiKey: "mock-gemini-key",
    fetchFn: mockFetchBadJson,
  });

  assert.equal(badJsonRes.success, false);
  if (!badJsonRes.success) {
    assert.equal(badJsonRes.error.code, "INVALID_LLM_OUTPUT");
  }
  console.log("✓ Test 9 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 10: Gemini timeout handled (504)
  // ---------------------------------------------------------------------------
  console.log("[Test 10] Testing Gemini timeout handling (504)...");
  const mockFetchTimeout: typeof fetch = async () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    throw err;
  };

  const timeoutRes = await generateScriptSafe(SAMPLE_RESEARCH_RESULT, {
    geminiApiKey: "mock-gemini-key",
    fetchFn: mockFetchTimeout,
  });

  assert.equal(timeoutRes.success, false);
  if (!timeoutRes.success) {
    assert.equal(timeoutRes.error.code, "GEMINI_TIMEOUT");
  }
  console.log("✓ Test 10 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 11: Missing API key fails safely (500)
  // ---------------------------------------------------------------------------
  console.log("[Test 11] Testing missing Gemini API key failure (500)...");
  const savedKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  const missingKeyRes = await generateScriptSafe(SAMPLE_RESEARCH_RESULT, {
    geminiApiKey: "",
    fetchFn: mockFetchValid,
  });

  assert.equal(missingKeyRes.success, false);
  if (!missingKeyRes.success) {
    assert.equal(missingKeyRes.error.code, "MISSING_GEMINI_KEY");
  }
  if (savedKey !== undefined) process.env.GEMINI_API_KEY = savedKey;
  console.log("✓ Test 11 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 12: Empty/invalid ResearchResult rejected before Gemini is called (400)
  // ---------------------------------------------------------------------------
  console.log("[Test 12] Testing empty/invalid ResearchResult rejection (400)...");
  let geminiCalledOnInvalid = false;
  const mockFetchShouldNotBeCalled: typeof fetch = async () => {
    geminiCalledOnInvalid = true;
    return createGeminiScriptResponse(validScriptPayload);
  };

  const emptyResearchRes = await generateScriptSafe(
    { summary: "" },
    {
      geminiApiKey: "mock-gemini-key",
      fetchFn: mockFetchShouldNotBeCalled,
    }
  );

  assert.equal(emptyResearchRes.success, false);
  assert.equal(geminiCalledOnInvalid, false, "Gemini must not be called when ResearchResult is invalid");
  if (!emptyResearchRes.success) {
    assert.equal(emptyResearchRes.error.code, "INVALID_RESEARCH");
  }
  console.log("✓ Test 12 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 13: Frontend ScriptResultCard & ChatMessage rendering
  // ---------------------------------------------------------------------------
  console.log("[Test 13] Testing ScriptResultCard & ChatMessage SSR rendering...");
  const cardHtml = renderToStaticMarkup(
    React.createElement(ScriptResultCard, { script: scriptResult })
  );

  assert.ok(cardHtml.includes("Presenter Script Ready"), "Must render card title");
  assert.ok(cardHtml.includes(scriptResult.title), "Must render script title");
  assert.ok(cardHtml.includes(`${scriptResult.wordCount} words`), "Must render word count");
  assert.ok(cardHtml.includes(`~${scriptResult.estimatedDurationSeconds}s airtime`), "Must render duration");
  assert.ok(cardHtml.includes("Copy Script"), "Must render copy button");

  const chatMessage: Message = {
    id: "script-msg-1",
    role: "assistant",
    type: "script",
    content: "Presenter script generated successfully.",
    metadata: {
      script: scriptResult,
    },
    createdAt: new Date().toISOString(),
  };

  const messageHtml = renderToStaticMarkup(
    React.createElement(ChatMessage, { message: chatMessage })
  );

  assert.ok(
    messageHtml.includes("Presenter Script Ready") &&
      messageHtml.includes(scriptResult.title),
    "ChatMessage must render ScriptResultCard when type='script'"
  );
  console.log("✓ Test 13 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 14: End-to-end Article -> ResearchResult -> NewsScript pipeline
  // ---------------------------------------------------------------------------
  console.log("[Test 14] Testing complete Article -> ResearchResult -> NewsScript pipeline...");
  const articleFixture: Article = {
    url: "https://example-sports-news.com/hockey/india-defeats-bangladesh-13-0",
    title: "India Defeats Bangladesh 13-0 in Asian Champions Trophy Opener",
    content:
      "India defeated Bangladesh 13-0 in their opening match of the Asian Champions Trophy 2026. Harmanpreet Singh scored twice from set pieces.",
    wordCount: 26,
  };

  let mockStep = 0;
  const mockFetchPipeline: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("generativelanguage.googleapis.com")) {
      mockStep++;
      if (mockStep === 1) {
        // Step 1: Claim extraction
        return createGeminiScriptResponse({
          mainStory: "India defeated Bangladesh 13-0 in the tournament opener.",
          claims: [
            { claim: "India defeated Bangladesh 13-0.", requiresVerification: true, category: "score_stat" },
            { claim: "Harmanpreet Singh scored twice.", requiresVerification: true, category: "score_stat" },
          ],
          keyEntities: ["India", "Bangladesh"],
          articleFacts: ["India defeated Bangladesh 13-0."],
        });
      }
      if (mockStep === 2) {
        // Step 2: Query generation
        return createGeminiScriptResponse({
          queries: ["India Bangladesh 13-0 Asian Champions Trophy"],
        });
      }
      if (mockStep === 3) {
        // Step 4: Evidence evaluation
        return createGeminiScriptResponse({
          summary: "Confirmed 13-0 win by India against Bangladesh.",
          evaluatedClaims: [
            {
              claim: "India defeated Bangladesh 13-0.",
              status: "verified",
              confidence: 0.99,
              evidence: "Confirmed by federation match sheets.",
              sourceUrls: ["https://tms.fih.ch/matches/23226"],
            },
            {
              claim: "Harmanpreet Singh scored twice.",
              status: "verified",
              confidence: 0.95,
              evidence: "Confirmed by match event logs.",
              sourceUrls: ["https://tms.fih.ch/matches/23226"],
            },
          ],
          additionalContext: [],
          needsMoreResearch: false,
        });
      }
      // Step 5: Phase 4 Script Generation
      return createGeminiScriptResponse({
        ...validScriptPayload,
        usedClaimIds: ["claim_1", "claim_2"],
        excludedClaimIds: [],
      });
    }

    if (url.includes("api.tavily.com/search")) {
      return new Response(
        JSON.stringify({
          results: [
            {
              title: "FIH Match Sheet IND 13-0 BAN",
              url: "https://tms.fih.ch/matches/23226",
              content: "India 13 - Bangladesh 0. Harmanpreet (2).",
            },
          ],
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  // Run Phase 3
  const phase3Research = await researchArticle(articleFixture, {
    geminiApiKey: "mock-gemini-key",
    tavilyApiKey: "mock-tavily-key",
    fetchFn: mockFetchPipeline,
  });

  assert.ok(phase3Research.claims.length >= 2);
  assert.equal(phase3Research.claims[0].status, "verified");

  // Run Phase 4
  const phase4Script = await generateScript(phase3Research, {
    geminiApiKey: "mock-gemini-key",
    fetchFn: mockFetchPipeline,
  });

  assert.ok(phase4Script.title);
  assert.ok(phase4Script.fullScript);
  assert.ok(phase4Script.usedClaimIds.length > 0);
  console.log("✓ Test 14 Passed\n");

  console.log("=======================================================");
  console.log("ALL 14 PHASE 4 SCRIPT GENERATION TESTS PASSED SUCCESSFULLY!");
  console.log("=======================================================");
}

runPhase4Tests().catch((err) => {
  console.error("Phase 4 test execution failed:", err);
  process.exit(1);
});

