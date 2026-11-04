import { ArticleExtractResponse } from "./articleTypes";
import { validateUrlSecurity } from "./security";
import { extractWithReadability } from "./readabilityExtractor";
import { extractWithFirecrawl } from "./firecrawlExtractor";

/**
 * Orchestrates the two-stage article extraction pipeline:
 * 1. URL security / SSRF pre-check
 * 2. Primary: Mozilla Readability + JSDOM
 * 3. Quality Gate
 * 4. Fallback: Firecrawl v2 Scrape API
 */
export async function extractArticle(rawUrl: string): Promise<ArticleExtractResponse> {
  console.log(`[Article] Article extraction started for: ${rawUrl}`);

  // Step 1: URL Validation & SSRF Protection
  const security = await validateUrlSecurity(rawUrl);
  if (!security.isSafe) {
    console.warn(`[Article] URL security rejected: ${security.reason}`);
    return {
      success: false,
      error: {
        code: "INVALID_URL",
        message: security.reason || "Please provide a valid HTTP or HTTPS URL.",
      },
    };
  }

  const targetUrl = security.normalizedUrl || rawUrl;

  // Step 2: Primary Extractor — Mozilla Readability + JSDOM
  console.log(`[Article] Readability extraction attempted`);
  const readabilityResult = await extractWithReadability(targetUrl);

  if (readabilityResult.success && readabilityResult.article) {
    console.log(`[Article] Readability extraction succeeded`);
    console.log(`[Article] Readability quality check passed`);
    return {
      success: true,
      article: readabilityResult.article,
      extractionMethod: "readability",
    };
  }

  // Step 3: Readability failed or produced poor content -> Fallback to Firecrawl
  console.log(`[Article] Readability extraction failed (${readabilityResult.failureReason || "quality check failed"})`);
  console.log(`[Article] Falling back to Firecrawl`);

  const firecrawlResult = await extractWithFirecrawl(targetUrl);

  if (firecrawlResult.success && firecrawlResult.article) {
    console.log(`[Article] Firecrawl extraction succeeded`);
    return {
      success: true,
      article: firecrawlResult.article,
      extractionMethod: "firecrawl",
    };
  }

  // If Firecrawl is unconfigured or failed
  if (firecrawlResult.notConfigured) {
    return {
      success: false,
      error: {
        code: "EXTRACTION_FAILED",
        message: "I couldn't extract this article automatically. The fallback extraction service is not configured.",
      },
    };
  }

  return {
    success: false,
    error: {
      code: "EXTRACTION_FAILED",
      message: firecrawlResult.failureReason || "Unable to extract an article from this URL.",
    },
  };
}
