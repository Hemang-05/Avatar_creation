import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Article } from "../src/lib/article/articleTypes";
import { researchArticle, researchArticleSafe } from "../src/lib/research/researchAgent";
import { MAX_RESEARCH_ITERATIONS } from "../src/lib/research/researchTypes";
import { ResearchResultCard } from "../src/components/chat/ResearchResultCard";
import { ChatMessage } from "../src/components/chat/ChatMessage";
import { Message } from "../src/types/chat";

const SAMPLE_ARTICLE: Article = {
  url: "https://example-sports-news.com/hockey/india-defeats-bangladesh-13-0",
  title: "India Defeats Bangladesh 13-0 in Asian Champions Trophy Opener",
  description: "Harmanpreet Singh scored twice and Mandeep Singh netted a hat-trick.",
  author: "Sports Desk",
  publishedAt: "2026-10-28T09:00:00Z",
  source: "example-sports-news.com",
  content:
    "India defeated Bangladesh 13-0 in their opening match of the Asian Champions Trophy 2026. Captain Harmanpreet Singh scored two goals from penalty corners, while forward Mandeep Singh scored three goals. Midfielder Nilakanta Sharma also announced his international retirement after the tournament.",
  wordCount: 42,
};

/**
 * Helper to create a mock Gemini API HTTP Response wrapping a JSON object
 */
function createGeminiResponse(jsonPayload: unknown, status = 200): Response {
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

/**
 * Helper to create a mock Tavily Search HTTP Response
 */
function createTavilyResponse(
  results: Array<{ title: string; url: string; content: string; score?: number }>,
  status = 200
): Response {
  return new Response(
    JSON.stringify({
      results,
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

async function runPhase3Tests() {
  console.log("=======================================================");
  console.log("RUNNING PHASE 3 RESEARCH AGENT UNIT & INTEGRATION TESTS");
  console.log("=======================================================\n");

  // ---------------------------------------------------------------------------
  // Test 1, 5, 6, 7, 8, 9: Valid article -> successful research with multiple
  // sources and verified, partially_verified, contradicted, and unverified claims
  // ---------------------------------------------------------------------------
  console.log("[Tests 1, 5, 6, 7, 8, 9] Testing full research flow, multiple sources & claim statuses...");
  let geminiCallCount = 0;
  let tavilyCallCount = 0;

  const mockFetchFull: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("generativelanguage.googleapis.com")) {
      geminiCallCount++;
      // Verify gemini-3.5-flash-lite model is used in endpoint URL
      assert.ok(
        url.includes("gemini-3.5-flash-lite"),
        `Expected model gemini-3.5-flash-lite in URL, got: ${url}`
      );

      if (geminiCallCount === 1) {
        // Step 1: Claim Extraction
        return createGeminiResponse({
          mainStory: "India defeated Bangladesh 13-0 in the Asian Champions Trophy opener.",
          claims: [
            {
              claim: "India defeated Bangladesh 13-0 in the Asian Champions Trophy opener.",
              requiresVerification: true,
              category: "score_stat",
            },
            {
              claim: "Harmanpreet Singh scored two goals.",
              requiresVerification: true,
              category: "score_stat",
            },
            {
              claim: "Mandeep Singh scored three goals.",
              requiresVerification: true,
              category: "score_stat",
            },
            {
              claim: "Nilakanta Sharma announced his retirement.",
              requiresVerification: true,
              category: "event",
            },
          ],
          keyEntities: ["India", "Bangladesh", "Harmanpreet Singh", "Mandeep Singh", "Nilakanta Sharma", "Asian Champions Trophy"],
          articleFacts: [
            "India defeated Bangladesh 13-0.",
            "Harmanpreet Singh scored twice.",
            "Mandeep Singh scored three goals.",
            "Nilakanta Sharma announced his retirement.",
          ],
          timeline: [{ date: "2026-10-28", event: "Asian Champions Trophy opening match" }],
        });
      }

      if (geminiCallCount === 2) {
        // Step 2: Query Generation
        return createGeminiResponse({
          queries: [
            "India Bangladesh 13-0 Asian Champions Trophy 2026",
            "Nilakanta Sharma retirement Asian Champions Trophy",
          ],
          rationale: "Verify match score, goal scorers, and retirement announcement.",
        });
      }

      // Step 4: Evidence Evaluation
      return createGeminiResponse({
        summary:
          "Official tournament reports confirm India defeated Bangladesh 13-0 with Harmanpreet Singh scoring twice. However, official match sheets show Mandeep Singh scored two goals rather than three, and no external source confirmed Nilakanta Sharma's retirement.",
        evaluatedClaims: [
          {
            claim: "India defeated Bangladesh 13-0 in the Asian Champions Trophy opener.",
            status: "verified",
            confidence: 0.98,
            evidence: "Confirmed by Asian Hockey Federation and Reuters match reports.",
            sourceUrls: [
              "https://asianhockey.org/matches/ind-vs-ban-2026",
              "https://reuters.com/sports/hockey-india-13-0-bangladesh",
            ],
          },
          {
            claim: "Harmanpreet Singh scored two goals.",
            status: "partially_verified",
            confidence: 0.78,
            evidence: "Reuters confirms Harmanpreet scored twice, though penalty corner breakdown differs slightly.",
            sourceUrls: ["https://reuters.com/sports/hockey-india-13-0-bangladesh"],
          },
          {
            claim: "Mandeep Singh scored three goals.",
            status: "contradicted",
            confidence: 0.92,
            evidence: "Official Asian Hockey Federation sheet credits Mandeep Singh with 2 goals and Abhishek with the third.",
            sourceUrls: ["https://asianhockey.org/matches/ind-vs-ban-2026"],
            conflict: "Original article states 3 goals for Mandeep Singh; official AHF match sheet records 2 goals.",
          },
          {
            claim: "Nilakanta Sharma announced his retirement.",
            status: "unverified",
            confidence: 0.1,
            evidence: "No independent or official federation source mentions a retirement announcement.",
            sourceUrls: [],
          },
        ],
        additionalContext: [
          "India now leads Pool A on goal difference (+13) following the opening round.",
        ],
        timeline: [{ date: "2026-10-28", event: "India defeats Bangladesh 13-0 in Pool A opener" }],
        needsMoreResearch: false,
      });
    }

    if (url.includes("api.tavily.com/search")) {
      tavilyCallCount++;
      return createTavilyResponse([
        {
          title: "IND vs BAN 13-0 Official Match Sheet - Asian Hockey Federation",
          url: "https://asianhockey.org/matches/ind-vs-ban-2026",
          content: "India defeated Bangladesh 13-0. Harmanpreet Singh (2), Mandeep Singh (2).",
          score: 0.97,
        },
        {
          title: "India routs Bangladesh 13-0 in Asian Champions Trophy opener - Reuters",
          url: "https://reuters.com/sports/hockey-india-13-0-bangladesh",
          content: "Defending champions India opened with a 13-0 win over Bangladesh.",
          score: 0.93,
        },
      ]);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const result1 = await researchArticle(SAMPLE_ARTICLE, {
    geminiApiKey: "test-gemini-key",
    tavilyApiKey: "test-tavily-key",
    fetchFn: mockFetchFull,
  });

  assert.equal(result1.articleUrl, SAMPLE_ARTICLE.url);
  assert.equal(result1.researchIterations, 1);
  assert.equal(tavilyCallCount, 2, "Should have executed 2 Tavily search queries");
  assert.equal(result1.sources.length, 2, "Should deduplicate and return 2 Tavily sources");
  assert.equal(result1.claims.length, 4);

  const verifiedClaim = result1.claims.find((c) => c.status === "verified");
  const partialClaim = result1.claims.find((c) => c.status === "partially_verified");
  const contradictedClaim = result1.claims.find((c) => c.status === "contradicted");
  const unverifiedClaim = result1.claims.find((c) => c.status === "unverified");

  assert.ok(verifiedClaim, "Test 6: Must include verified claim");
  assert.equal(verifiedClaim.sourceUrls.length, 2);

  assert.ok(partialClaim, "Test 7: Must include partially_verified claim");
  assert.ok(contradictedClaim, "Test 8: Must include contradicted claim");
  assert.ok(contradictedClaim.conflict?.includes("AHF"), "Must preserve conflict explanation");
  assert.ok(unverifiedClaim, "Test 9: Must include unverified claim");
  console.log("✓ Tests 1, 5, 6, 7, 8, 9 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 2: Missing Gemini API Key
  // ---------------------------------------------------------------------------
  console.log("[Test 2] Testing missing Gemini API key...");
  const oldGeminiKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  const missingGeminiRes = await researchArticleSafe(SAMPLE_ARTICLE, {
    geminiApiKey: "",
    tavilyApiKey: "test-tavily-key",
    fetchFn: mockFetchFull,
  });

  assert.equal(missingGeminiRes.success, false);
  if (!missingGeminiRes.success) {
    assert.equal(missingGeminiRes.error.code, "MISSING_GEMINI_KEY");
  }
  if (oldGeminiKey !== undefined) process.env.GEMINI_API_KEY = oldGeminiKey;
  console.log("✓ Test 2 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 3: Missing Tavily API Key
  // ---------------------------------------------------------------------------
  console.log("[Test 3] Testing missing Tavily API key...");
  const oldTavilyKey = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;

  const missingTavilyRes = await researchArticleSafe(SAMPLE_ARTICLE, {
    geminiApiKey: "test-gemini-key",
    tavilyApiKey: "",
    fetchFn: mockFetchFull,
  });

  assert.equal(missingTavilyRes.success, false);
  if (!missingTavilyRes.success) {
    assert.equal(missingTavilyRes.error.code, "MISSING_TAVILY_KEY");
  }
  if (oldTavilyKey !== undefined) process.env.TAVILY_API_KEY = oldTavilyKey;
  console.log("✓ Test 3 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 4 & Test 10: Tavily returns no results + Research iteration limit
  // ---------------------------------------------------------------------------
  console.log("[Tests 4 & 10] Testing empty Tavily results and MAX_RESEARCH_ITERATIONS cap...");
  let emptyLoopTavilyCalls = 0;

  const mockFetchEmptyTavily: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("generativelanguage.googleapis.com")) {
      // Return valid schema for both claim extraction and query generation
      return createGeminiResponse({
        mainStory: "India defeated Bangladesh 13-0.",
        claims: [
          {
            claim: "India defeated Bangladesh 13-0.",
            requiresVerification: true,
            category: "score_stat",
          },
        ],
        keyEntities: ["India", "Bangladesh"],
        articleFacts: ["India defeated Bangladesh 13-0."],
        queries: ["India Bangladesh 13-0 hockey"],
      });
    }
    if (url.includes("api.tavily.com/search")) {
      emptyLoopTavilyCalls++;
      return createTavilyResponse([]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const emptyTavilyResult = await researchArticle(SAMPLE_ARTICLE, {
    geminiApiKey: "test-gemini-key",
    tavilyApiKey: "test-tavily-key",
    maxIterations: MAX_RESEARCH_ITERATIONS,
    fetchFn: mockFetchEmptyTavily,
  });

  assert.equal(
    emptyTavilyResult.researchIterations,
    MAX_RESEARCH_ITERATIONS,
    `Should stop after MAX_RESEARCH_ITERATIONS (${MAX_RESEARCH_ITERATIONS})`
  );
  assert.equal(emptyLoopTavilyCalls, MAX_RESEARCH_ITERATIONS);
  assert.equal(emptyTavilyResult.sources.length, 0);
  assert.ok(
    emptyTavilyResult.claims.every((c) => c.status === "unverified"),
    "When Tavily returns no results, all claims must be marked unverified"
  );
  assert.equal(emptyTavilyResult.overallConfidence, 0);
  console.log("✓ Tests 4 & 10 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 11: Gemini invalid structured output
  // ---------------------------------------------------------------------------
  console.log("[Test 11] Testing Gemini invalid structured output handling...");
  const mockFetchBadGemini: typeof fetch = async () => {
    return createGeminiResponse("THIS IS NOT JSON AT ALL {{{");
  };

  const badGeminiRes = await researchArticleSafe(SAMPLE_ARTICLE, {
    geminiApiKey: "test-gemini-key",
    tavilyApiKey: "test-tavily-key",
    fetchFn: mockFetchBadGemini,
  });

  assert.equal(badGeminiRes.success, false);
  if (!badGeminiRes.success) {
    assert.equal(badGeminiRes.error.code, "INVALID_LLM_OUTPUT");
  }
  console.log("✓ Test 11 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 12: Tavily timeout and rate-limit handling
  // ---------------------------------------------------------------------------
  console.log("[Test 12] Testing Tavily rate-limit (429) and timeout handling...");
  const mockFetchTavilyRateLimit: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("generativelanguage.googleapis.com")) {
      return createGeminiResponse({
        mainStory: "India defeated Bangladesh 13-0.",
        claims: [{ claim: "India won 13-0", requiresVerification: true, category: "score_stat" }],
        keyEntities: ["India"],
        articleFacts: ["India won 13-0"],
        queries: ["India 13-0 hockey"],
      });
    }
    return new Response("Too Many Requests", { status: 429 });
  };

  const rateLimitRes = await researchArticleSafe(SAMPLE_ARTICLE, {
    geminiApiKey: "test-gemini-key",
    tavilyApiKey: "test-tavily-key",
    fetchFn: mockFetchTavilyRateLimit,
  });

  assert.equal(rateLimitRes.success, false);
  if (!rateLimitRes.success) {
    assert.equal(rateLimitRes.error.code, "TAVILY_RATE_LIMIT");
  }

  // Test Tavily Timeout (AbortError)
  const mockFetchTavilyTimeout: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("generativelanguage.googleapis.com")) {
      return createGeminiResponse({
        mainStory: "India defeated Bangladesh 13-0.",
        claims: [{ claim: "India won 13-0", requiresVerification: true, category: "score_stat" }],
        keyEntities: ["India"],
        articleFacts: ["India won 13-0"],
        queries: ["India 13-0 hockey"],
      });
    }
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    throw abortErr;
  };

  const timeoutRes = await researchArticleSafe(SAMPLE_ARTICLE, {
    geminiApiKey: "test-gemini-key",
    tavilyApiKey: "test-tavily-key",
    fetchFn: mockFetchTavilyTimeout,
  });

  assert.equal(timeoutRes.success, false);
  if (!timeoutRes.success) {
    assert.equal(timeoutRes.error.code, "TAVILY_TIMEOUT");
  }
  console.log("✓ Test 12 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 13: Source URLs ONLY originate from Tavily results (anti-hallucination)
  // ---------------------------------------------------------------------------
  console.log("[Test 13] Testing strict filtering of hallucinated LLM source URLs...");
  let step13 = 0;
  const mockFetchHallucinatedUrls: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("generativelanguage.googleapis.com")) {
      step13++;
      if (step13 === 1) {
        return createGeminiResponse({
          mainStory: "India won 13-0.",
          claims: [
            { claim: "India won 13-0", requiresVerification: true, category: "score_stat" },
            { claim: "Fake claim with invented URL", requiresVerification: true, category: "event" },
          ],
          keyEntities: ["India"],
          articleFacts: ["India won 13-0"],
        });
      }
      if (step13 === 2) {
        return createGeminiResponse({ queries: ["India 13-0"] });
      }
      // Step 4: LLM attempts to inject a hallucinated URL not in Tavily results
      return createGeminiResponse({
        summary: "Summary of findings.",
        evaluatedClaims: [
          {
            claim: "India won 13-0",
            status: "verified",
            confidence: 0.95,
            evidence: "Confirmed by real source.",
            sourceUrls: [
              "https://real-tavily-source.org/report",
              "https://hallucinated-fake-domain.com/fake-article",
            ],
          },
          {
            claim: "Fake claim with invented URL",
            status: "verified",
            confidence: 0.9,
            evidence: "LLM tried to verify using only a fabricated URL.",
            sourceUrls: ["https://completely-fabricated-url.io/news"],
          },
        ],
        additionalContext: [],
        needsMoreResearch: false,
      });
    }

    return createTavilyResponse([
      {
        title: "Real Tavily Report",
        url: "https://real-tavily-source.org/report",
        content: "India won 13-0.",
        score: 0.95,
      },
    ]);
  };

  const sanitizedResult = await researchArticle(SAMPLE_ARTICLE, {
    geminiApiKey: "test-gemini-key",
    tavilyApiKey: "test-tavily-key",
    fetchFn: mockFetchHallucinatedUrls,
  });

  const firstClaim = sanitizedResult.claims[0];
  assert.deepEqual(
    firstClaim.sourceUrls,
    ["https://real-tavily-source.org/report"],
    "Hallucinated URL must be stripped from verified claim"
  );

  const secondClaim = sanitizedResult.claims[1];
  assert.equal(
    secondClaim.status,
    "unverified",
    "Claim whose only URL was hallucinated must be downgraded to unverified"
  );
  assert.equal(secondClaim.sourceUrls.length, 0);
  console.log("✓ Test 13 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 14: Frontend successfully displays ResearchResult
  // ---------------------------------------------------------------------------
  console.log("[Test 14] Testing Frontend ResearchResultCard & ChatMessage rendering...");
  const cardHtml = renderToStaticMarkup(
    React.createElement(ResearchResultCard, {
      research: result1,
      articleTitle: SAMPLE_ARTICLE.title,
    })
  );

  assert.ok(cardHtml.includes("Research Complete"), "Must display research status");
  assert.ok(cardHtml.includes(SAMPLE_ARTICLE.title), "Must display article title");
  assert.ok(
    cardHtml.includes("Official tournament reports confirm India defeated Bangladesh 13-0"),
    "Must display short research summary"
  );
  assert.ok(cardHtml.includes("Total Claims"), "Must display number of claims label");
  assert.ok(
    cardHtml.includes("India defeated Bangladesh 13-0"),
    "Must display verified claim text"
  );
  assert.ok(
    cardHtml.includes("Conflicting Evidence"),
    "Must display conflict alert for contradicted claim"
  );
  assert.ok(
    cardHtml.includes("asianhockey.org"),
    "Must display Tavily source domain in source list"
  );
  assert.ok(cardHtml.includes("Confidence:"), "Must display overall confidence");

  const chatMsg: Message = {
    id: "research-msg-1",
    role: "assistant",
    type: "research",
    content: "Research complete",
    metadata: {
      articleUrl: SAMPLE_ARTICLE.url,
      title: SAMPLE_ARTICLE.title,
      research: result1,
    },
    createdAt: new Date().toISOString(),
  };

  const messageHtml = renderToStaticMarkup(
    React.createElement(ChatMessage, { message: chatMsg })
  );
  assert.ok(
    messageHtml.includes("Research Complete") &&
      messageHtml.includes("Independently Verified Claims"),
    "ChatMessage must render ResearchResultCard for type='research'"
  );
  console.log("✓ Test 14 Passed\n");

  console.log("=======================================================");
  console.log("ALL 14 PHASE 3 RESEARCH AGENT TESTS PASSED SUCCESSFULLY!");
  console.log("=======================================================");
}

runPhase3Tests().catch((err) => {
  console.error("Phase 3 test suite failed:", err);
  process.exit(1);
});

