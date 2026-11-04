import { Article } from "./articleTypes";
import { cleanHtmlToText, countWords, evaluateArticleQuality } from "./articleQuality";

export interface FirecrawlExtractionResult {
  success: boolean;
  article?: Article;
  notConfigured?: boolean;
  failureReason?: string;
}

/**
 * Fallback extractor using Firecrawl Scrape API v2.
 * Only called if Mozilla Readability fails or produces substandard content.
 */
export async function extractWithFirecrawl(targetUrl: string): Promise<FirecrawlExtractionResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();

  if (!apiKey) {
    console.log("[Firecrawl] Fallback skipped: FIRECRAWL_API_KEY is not configured.");
    return {
      success: false,
      notConfigured: true,
      failureReason: "I couldn't extract this article automatically. The fallback extraction service is not configured.",
    };
  }

  console.log(`[Firecrawl] Falling back to Firecrawl for: ${targetUrl}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: targetUrl,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      console.error("[Firecrawl] Authentication error (invalid API key).");
      return {
        success: false,
        failureReason: "Firecrawl authorization failed. Please verify your FIRECRAWL_API_KEY.",
      };
    }

    if (response.status === 429) {
      console.warn("[Firecrawl] Rate limit encountered.");
      return {
        success: false,
        failureReason: "Firecrawl rate limit reached. Please try again shortly.",
      };
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.warn(`[Firecrawl] HTTP ${response.status} error: ${errText.slice(0, 150)}`);
      return {
        success: false,
        failureReason: `Firecrawl service returned HTTP ${response.status}.`,
      };
    }

    const payload = await response.json();
    const data = payload?.data;
    const metadata = data?.metadata || {};
    const rawMarkdown = data?.markdown || "";

    const urlObj = new URL(targetUrl);
    const domainSource = urlObj.hostname.replace(/^www\./, "");

    const cleanedContent = cleanHtmlToText(rawMarkdown);
    const words = countWords(cleanedContent);

    const candidate: Partial<Article> = {
      url: targetUrl,
      title: metadata.title || metadata.ogTitle || "",
      description: metadata.description || metadata.ogDescription || undefined,
      author: metadata.author || undefined,
      publishedAt: metadata.publishedTime || metadata.date || undefined,
      source: metadata.sourceURL ? new URL(metadata.sourceURL).hostname.replace(/^www\./, "") : domainSource,
      content: cleanedContent,
      wordCount: words,
    };

    const quality = evaluateArticleQuality(candidate);
    if (!quality.isValid || !quality.cleanedContent || !quality.wordCount) {
      console.warn(`[Firecrawl] Content failed quality validation: ${quality.reason}`);
      return {
        success: false,
        failureReason: quality.reason || "Firecrawl extracted content did not meet minimum quality threshold.",
      };
    }

    console.log(`[Firecrawl] Firecrawl extraction succeeded (${quality.wordCount} words)`);
    return {
      success: true,
      article: {
        url: targetUrl,
        title: candidate.title!,
        description: candidate.description,
        author: candidate.author,
        publishedAt: candidate.publishedAt,
        source: candidate.source,
        content: quality.cleanedContent,
        wordCount: quality.wordCount,
      },
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      console.warn("[Firecrawl] Request timed out after 20 seconds.");
      return {
        success: false,
        failureReason: "Firecrawl request timed out.",
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Firecrawl] Invocation error:", message);
    return {
      success: false,
      failureReason: "Encountered an unexpected error communicating with Firecrawl.",
    };
  }
}
