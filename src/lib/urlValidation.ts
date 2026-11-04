/**
 * Basic client-side URL validation for NewsAI Studio (Phase 1).
 * Accepts:
 *   - https://example.com/article
 *   - https://www.espncricinfo.com/...
 *   - https://www.bbc.com/sport/...
 * Rejects:
 *   - Obvious non-URLs like "hello", plain text, mailto, etc.
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  normalizedUrl?: string;
  domain?: string;
}

export function validateArticleUrl(rawInput: string): ValidationResult {
  const trimmed = rawInput.trim();

  if (!trimmed) {
    return {
      isValid: false,
      error: "Please enter a news article URL",
    };
  }

  // Reject obvious non-URL patterns without protocol or domain
  if (!trimmed.includes(".")) {
    return {
      isValid: false,
      error: "Please enter a valid URL (e.g., https://bbc.com/sport/...)",
    };
  }

  try {
    // Attempt standard URL parse
    let parsed: URL;
    if (!/^https?:\/\//i.test(trimmed)) {
      // If user typed 'bbc.com/sport/article', reject or inform them to include https://
      return {
        isValid: false,
        error: "URL must start with https:// or http://",
      };
    } else {
      parsed = new URL(trimmed);
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        isValid: false,
        error: "Please provide an HTTP or HTTPS web link",
      };
    }

    const host = parsed.hostname.toLowerCase();
    if (!host || !host.includes(".")) {
      return {
        isValid: false,
        error: "Invalid web domain name in URL",
      };
    }

    // Clean up domain (remove leading 'www.')
    const cleanDomain = host.replace(/^www\./, "");

    return {
      isValid: true,
      normalizedUrl: parsed.toString(),
      domain: cleanDomain,
    };
  } catch {
    return {
      isValid: false,
      error: "Invalid URL format. Please paste a valid news article link.",
    };
  }
}

/**
 * Extracts a readable story title from URL slug if available, for rich mock presentation.
 */
export function extractStoryTitleFromUrl(urlString: string): string {
  try {
    const url = new URL(urlString);
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1] || "";
    
    // Remove file extensions or trailing IDs
    const cleanSlug = lastSegment.replace(/\.(html|php|aspx|jsp)$/i, "");
    
    if (cleanSlug.length > 5) {
      const words = cleanSlug
        .split(/[-_]+/)
        .filter((w) => isNaN(Number(w)) && w.length > 1)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
      
      if (words.length >= 2) {
        return words.join(" ");
      }
    }

    const domain = url.hostname.replace(/^www\./, "");
    return `Breaking News from ${domain}`;
  } catch {
    return "Breaking News Story Video";
  }
}
