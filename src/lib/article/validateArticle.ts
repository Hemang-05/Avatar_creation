import { Article } from "@/types/article";

export interface ArticleQualityResult {
  isValid: boolean;
  reason?: string;
  cleanedContent?: string;
  wordCount?: number;
}

const COMMON_BLOCKER_PATTERNS = [
  /please enable javascript/i,
  /access denied/i,
  /just a moment\.\.\./i, // Cloudflare turnstile
  /enable cookies/i,
  /subscribe to read/i,
  /subscription required/i,
  /disable your ad blocker/i,
  /sign in to your account/i,
  /you need to enable javascript/i,
  /checking your browser/i,
];

/**
 * Strips residual HTML tags and cleans up excessive whitespace.
 */
export function cleanHtmlToText(rawHtmlOrMarkdown: string): string {
  // If it's HTML, remove tags, script, style
  let text = rawHtmlOrMarkdown
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  // Normalize excessive newlines and spaces
  text = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n\n");

  return text.trim();
}

/**
 * Counts words accurately in clean text.
 */
export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Evaluates whether extracted article data meets basic editorial quality thresholds.
 */
export function validateArticleQuality(candidate: Partial<Article>): ArticleQualityResult {
  if (!candidate.title || candidate.title.trim().length < 5) {
    return {
      isValid: false,
      reason: "Extracted article title is missing or too short.",
    };
  }

  const rawContent = candidate.content || "";
  const cleaned = cleanHtmlToText(rawContent);
  const words = countWords(cleaned);

  // Content length check: minimum 30 words and 150 characters
  if (cleaned.length < 150 || words < 30) {
    return {
      isValid: false,
      reason: `Extracted content is too brief (${words} words, ${cleaned.length} chars). Likely failed or paywalled.`,
    };
  }

  // Check for common bot challenge / subscription walls in short snippets
  for (const pattern of COMMON_BLOCKER_PATTERNS) {
    if (pattern.test(cleaned.slice(0, 500))) {
      return {
        isValid: false,
        reason: "Content matched automated access block or paywall prompt.",
      };
    }
  }

  return {
    isValid: true,
    cleanedContent: cleaned,
    wordCount: words,
  };
}
