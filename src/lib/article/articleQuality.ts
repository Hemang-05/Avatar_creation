import { Article } from "./articleTypes";

export interface QualityCheckResult {
  isValid: boolean;
  reason?: string;
  cleanedContent?: string;
  wordCount?: number;
}

const COMMON_BLOCKER_PATTERNS = [
  /please enable javascript/i,
  /access denied/i,
  /just a moment\.\.\./i, // Cloudflare challenge
  /enable cookies/i,
  /subscribe to read/i,
  /subscription required/i,
  /disable your ad blocker/i,
  /sign in to your account/i,
  /you need to enable javascript/i,
  /checking your browser/i,
  /404 not found/i,
  /page not found/i,
  /internal server error/i,
];

/**
 * Strips residual HTML tags, scripts, and excessive whitespace into clean text/markdown-like format.
 */
export function cleanHtmlToText(rawHtmlOrMarkdown: string): string {
  if (!rawHtmlOrMarkdown) return "";

  // Remove script and style tags
  let text = rawHtmlOrMarkdown
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  // Decode standard HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  // Format paragraphs cleanly
  const cleanParagraphs = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return cleanParagraphs.join("\n\n").trim();
}

/**
 * Accurately counts words in sanitized text.
 */
export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Quality gate inspecting title, content length, word count, and boilerplate indicators.
 */
export function evaluateArticleQuality(candidate: Partial<Article>): QualityCheckResult {
  if (!candidate.title || candidate.title.trim().length < 5) {
    return {
      isValid: false,
      reason: "Extracted article title is missing or too short (less than 5 characters).",
    };
  }

  const rawContent = candidate.content || "";
  const cleaned = cleanHtmlToText(rawContent);
  const words = countWords(cleaned);

  // Content length threshold: articles should have at least 35 words and 160 characters
  if (cleaned.length < 160 || words < 35) {
    return {
      isValid: false,
      reason: `Extracted content is too brief (${words} words, ${cleaned.length} chars). Likely failed or paywalled.`,
    };
  }

  // Detect bot challenge, paywall wall, or error pages in extracted snippet
  const sample = (candidate.title + " " + cleaned.slice(0, 600)).toLowerCase();
  for (const pattern of COMMON_BLOCKER_PATTERNS) {
    if (pattern.test(sample)) {
      return {
        isValid: false,
        reason: "Content matched automated access block, paywall prompt, or error page.",
      };
    }
  }

  return {
    isValid: true,
    cleanedContent: cleaned,
    wordCount: words,
  };
}
