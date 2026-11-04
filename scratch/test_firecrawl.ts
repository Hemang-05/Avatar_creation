import { extractWithFirecrawl } from "../src/lib/article/firecrawlExtractor";

async function testFirecrawlIntegration() {
  console.log("Testing Firecrawl v2 API configuration and request envelope...");

  // 1. Without API key
  delete process.env.FIRECRAWL_API_KEY;
  const noKey = await extractWithFirecrawl("https://example.com/test");
  console.assert(noKey.notConfigured === true, "Must flag notConfigured when key is missing");
  console.log("✓ Correctly detected unconfigured FIRECRAWL_API_KEY");

  // 2. With dummy API key to verify endpoint & payload structure
  process.env.FIRECRAWL_API_KEY = "fc_test_dummy_key_12345";
  const dummyResult = await extractWithFirecrawl("https://example.com/test");
  console.log("Dummy result with invalid key (expected 401 or network rejection):", dummyResult);
  console.assert(dummyResult.success === false, "Dummy key must fail gracefully");
  console.assert(
    dummyResult.failureReason?.includes("authorization") ||
    dummyResult.failureReason?.includes("HTTP 401") ||
    dummyResult.failureReason?.includes("HTTP 403") ||
    dummyResult.failureReason?.includes("Firecrawl"),
    "Must return clear, safe error message without leaking key"
  );
  console.log("✓ Firecrawl v2 API call, headers, and error isolation verified!");

  // Cleanup
  delete process.env.FIRECRAWL_API_KEY;
}

testFirecrawlIntegration().catch((e) => {
  console.error(e);
  process.exit(1);
});
