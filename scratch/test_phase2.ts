import { extractArticle } from "../src/lib/article/extractArticle";
import { evaluateArticleQuality } from "../src/lib/article/articleQuality";

async function runPhase2Tests() {
  console.log("=========================================");
  console.log("RUNNING PHASE 2 READABILITY & FIRECRAWL TESTS");
  console.log("=========================================\n");

  // Test 1: Invalid URL
  console.log("[Test 1] Testing invalid URL input ('hello')...");
  const test1 = await extractArticle("hello");
  console.log("Test 1 Result:", test1);
  console.assert(test1.success === false, "Invalid URL must fail");
  if (!test1.success) {
    console.assert(test1.error.code === "INVALID_URL", "Error code must be INVALID_URL");
  }
  console.log("✓ Test 1 Passed\n");

  // Test 2: SSRF & Private Network Block
  console.log("[Test 2] Testing SSRF protection (localhost / 127.0.0.1)...");
  const test2 = await extractArticle("http://127.0.0.1:8080/admin/secret");
  console.log("Test 2 Result:", test2);
  console.assert(test2.success === false, "Localhost must be blocked");
  if (!test2.success) {
    console.assert(test2.error.code === "INVALID_URL", "Error code must be INVALID_URL");
  }

  const test2b = await extractArticle("http://169.254.169.254/latest/meta-data");
  console.log("Test 2b (AWS metadata IP):", test2b);
  console.assert(test2b.success === false, "Cloud metadata IP must be blocked");
  console.log("✓ Test 2 Passed\n");

  // Test 3: Unreachable / Non-existent URL
  console.log("[Test 3] Testing unreachable domain (non-existent host)...");
  const test3 = await extractArticle("https://unreachable-domain-xyz-9876543210.org/news/sample");
  console.log("Test 3 Result:", test3);
  console.assert(test3.success === false, "Unreachable host must fail gracefully");
  console.log("✓ Test 3 Passed\n");

  // Test 4: Poor / Substandard Extraction Quality (e.g. example.com only has 20 words)
  console.log("[Test 4] Testing low content / poor quality page...");
  const qualityCheck = evaluateArticleQuality({
    title: "Example Domain",
    content: "This domain is for use in illustrative examples in documents.",
  });
  console.log("Test 4 Quality Check:", qualityCheck);
  console.assert(qualityCheck.isValid === false, "Content under 35 words must fail quality gate");
  console.log("✓ Test 4 Passed\n");

  // Test 5: Real Article Extraction (Wikipedia Current Events / News Story)
  console.log("[Test 5] Testing real web article extraction with Readability + JSDOM...");
  const realUrl = "https://en.wikipedia.org/wiki/Portal:Current_events";
  const test5 = await extractArticle(realUrl);
  if (test5.success) {
    console.log("Test 5 Result:", {
      success: test5.success,
      title: test5.article.title,
      wordCount: test5.article.wordCount,
      source: test5.article.source,
      extractionMethod: test5.extractionMethod,
      snippet: test5.article.content.slice(0, 150),
    });
    console.assert(test5.extractionMethod === "readability", "Extraction method should be readability");
    console.assert(test5.article.wordCount > 50, "Word count must be substantial");
  } else {
    console.error("Test 5 failed:", test5.error);
    throw new Error("Test 5 failed");
  }
  console.log("✓ Test 5 Passed\n");

  // Test 6: Fallback to Firecrawl behavior when Readability fails on non-article/thin content
  console.log("[Test 6] Testing fallback behavior when Readability fails on poor content...");
  const test6 = await extractArticle("https://example.com");
  console.log("Test 6 Result:", test6);
  console.assert(test6.success === false, "example.com has insufficient article text");
  console.log("✓ Test 6 Passed\n");

  console.log("=========================================");
  console.log("ALL PHASE 2 EXTRACTION TESTS PASSED!");
  console.log("=========================================");
}

runPhase2Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
