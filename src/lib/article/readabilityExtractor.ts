import { Article } from "./articleTypes";
import { safeFetchHtml } from "./security";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { evaluateArticleQuality } from "./articleQuality";

export interface ReadabilityExtractionResult {
  success: boolean;
  article?: Article;
  failureReason?: string;
}

/**
 * Extracts article using JSDOM and Mozilla Readability.
 * Runs completely locally, server-side, with zero external API calls.
 */
export async function extractWithReadability(targetUrl: string): Promise<ReadabilityExtractionResult> {
  console.log(`[Readability] Extraction attempted for: ${targetUrl}`);

  let html: string;
  let finalUrl = targetUrl;

  try {
    const fetchResult = await safeFetchHtml(targetUrl);
    html = fetchResult.html;
    finalUrl = fetchResult.finalUrl;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Readability] Fetch failed for ${targetUrl}: ${msg}`);
    return {
      success: false,
      failureReason: `Fetch error: ${msg}`,
    };
  }

  try {
    const urlObj = new URL(finalUrl);
    const domainSource = urlObj.hostname.replace(/^www\./, "");

    // 1. Parse HTML with JSDOM
    const dom = new JSDOM(html, {
      url: finalUrl,
      runScripts: undefined, // no script execution for safety
    });
    const doc = dom.window.document;

    // Helper: inspect document metadata tags for fallbacks
    const metaAuthor =
      doc.querySelector("meta[name='author']")?.getAttribute("content") ||
      doc.querySelector("meta[property='article:author']")?.getAttribute("content") ||
      undefined;

    const metaPublished =
      doc.querySelector("meta[property='article:published_time']")?.getAttribute("content") ||
      doc.querySelector("meta[name='publication_date']")?.getAttribute("content") ||
      doc.querySelector("meta[name='date']")?.getAttribute("content") ||
      doc.querySelector("time[datetime]")?.getAttribute("datetime") ||
      undefined;

    const metaDescription =
      doc.querySelector("meta[name='description']")?.getAttribute("content") ||
      doc.querySelector("meta[property='og:description']")?.getAttribute("content") ||
      undefined;

    // 2. Run Mozilla Readability
    const reader = new Readability(doc, {
      charThreshold: 80,
    });
    const parsed = reader.parse();

    if (!parsed || !parsed.textContent) {
      console.warn(`[Readability] Readability failed to identify an article structure.`);
      return {
        success: false,
        failureReason: "Mozilla Readability could not find article content on the page.",
      };
    }

    // 3. Assemble candidate article
    const candidate: Partial<Article> = {
      url: finalUrl,
      title: parsed.title?.trim() || doc.title?.trim() || "",
      description: parsed.excerpt?.trim() || metaDescription?.trim() || undefined,
      author: parsed.byline?.trim() || metaAuthor?.trim() || undefined,
      publishedAt: parsed.publishedTime || metaPublished || undefined,
      source: parsed.siteName?.trim() || domainSource,
      content: parsed.textContent,
    };

    // 4. Run through quality gate
    const quality = evaluateArticleQuality(candidate);

    if (!quality.isValid || !quality.cleanedContent || !quality.wordCount) {
      console.warn(`[Readability] Quality check rejected candidate: ${quality.reason}`);
      return {
        success: false,
        failureReason: quality.reason || "Content failed quality gate threshold.",
      };
    }

    console.log(`[Readability] Readability extraction succeeded (${quality.wordCount} words)`);
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
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Readability] Parsing error on ${targetUrl}:`, errorMsg);
    return {
      success: false,
      failureReason: `Readability parser exception: ${errorMsg}`,
    };
  }
}
