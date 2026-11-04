import { Article } from "@/types/article";
import { safeFetchHtml } from "./security";
import { extractFromHtml } from "@extractus/article-extractor";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { validateArticleQuality } from "./validateArticle";

export interface LocalExtractionResult {
  success: boolean;
  article?: Article;
  failureReason?: string;
}

/**
 * Extracts news article locally using Extractus and Mozilla Readability (Linkedom).
 * Zero-cost, runs fully in-process.
 */
export async function extractArticleLocally(targetUrl: string): Promise<LocalExtractionResult> {
  console.log(`[Article] Trying local extractor for: ${targetUrl}`);

  let html: string;
  let finalUrl = targetUrl;

  try {
    const fetchResult = await safeFetchHtml(targetUrl);
    html = fetchResult.html;
    finalUrl = fetchResult.finalUrl;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[Article] Local fetch failed for ${targetUrl}: ${message}`);
    return {
      success: false,
      failureReason: `Fetch error: ${message}`,
    };
  }

  const urlObj = new URL(finalUrl);
  const domainSource = urlObj.hostname.replace(/^www\./, "");

  // Strategy A: @extractus/article-extractor
  try {
    const extractusData = await extractFromHtml(html, finalUrl);
    if (extractusData && extractusData.content) {
      const candidate: Partial<Article> = {
        url: finalUrl,
        title: extractusData.title || "",
        description: extractusData.description || undefined,
        author: extractusData.author || undefined,
        publishedAt: extractusData.published || undefined,
        source: extractusData.source || domainSource,
        content: extractusData.content,
      };

      const quality = validateArticleQuality(candidate);
      if (quality.isValid && quality.cleanedContent && quality.wordCount) {
        console.log(`[Article] Local extraction succeeded via Extractus (${quality.wordCount} words)`);
        return {
          success: true,
          article: {
            url: finalUrl,
            title: candidate.title!,
            description: candidate.description,
            author: candidate.author,
            publishedAt: candidate.publishedAt,
            source: candidate.source,
            content: quality.cleanedContent,
            wordCount: quality.wordCount,
          },
        };
      } else {
        console.log(`[Article] Extractus extraction failed quality check: ${quality.reason}`);
      }
    }
  } catch (err) {
    console.warn("[Article] Extractus parser encountered error, falling back to Readability:", err);
  }

  // Strategy B: @mozilla/readability with linkedom
  try {
    const { document } = parseHTML(html);
    const reader = new Readability(document, {
      charThreshold: 100,
    });
    const parsed = reader.parse();

    if (parsed && parsed.textContent) {
      const candidate: Partial<Article> = {
        url: finalUrl,
        title: parsed.title || "",
        description: parsed.excerpt || undefined,
        author: parsed.byline || undefined,
        publishedAt: parsed.publishedTime || undefined,
        source: parsed.siteName || domainSource,
        content: parsed.textContent,
      };

      const quality = validateArticleQuality(candidate);
      if (quality.isValid && quality.cleanedContent && quality.wordCount) {
        console.log(`[Article] Local extraction succeeded via Mozilla Readability (${quality.wordCount} words)`);
        return {
          success: true,
          article: {
            url: finalUrl,
            title: candidate.title!,
            description: candidate.description,
            author: candidate.author,
            publishedAt: candidate.publishedAt,
            source: candidate.source,
            content: quality.cleanedContent,
            wordCount: quality.wordCount,
          },
        };
      } else {
        console.log(`[Article] Mozilla Readability failed quality check: ${quality.reason}`);
        return {
          success: false,
          failureReason: quality.reason || "Article content quality check failed.",
        };
      }
    }
  } catch (err) {
    console.warn("[Article] Readability parser failed:", err);
  }

  return {
    success: false,
    failureReason: "Unable to extract readable article content using local parsers.",
  };
}
