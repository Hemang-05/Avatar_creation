import {
  ResearchAgentError,
  ResearchAgentOptions,
  ResearchSource,
} from "./researchTypes";
import { extractDomain, normalizeUrlForComparison } from "./researchUtils";

interface TavilyRawResultItem {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string;
  score?: number;
}

interface TavilyRawResponse {
  query?: string;
  results?: TavilyRawResultItem[];
}

/**
 * Executes a single query against the Tavily Search API with retry resilience.
 */
export async function searchTavilyQuery(
  query: string,
  options: ResearchAgentOptions = {}
): Promise<ResearchSource[]> {
  const apiKey = (options.tavilyApiKey ?? process.env.TAVILY_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new ResearchAgentError(
      "MISSING_TAVILY_KEY",
      "Server configuration error: TAVILY_API_KEY is not configured.",
      500
    );
  }

  const timeoutMs = options.tavilyTimeoutMs ?? 20000;
  const fetchImpl = options.fetchFn ?? fetch;

  let response: Response | null = null;
  let lastError: unknown = null;

  // Retry loop for transient network glitches or timeouts (up to 2 attempts)
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      response = await fetchImpl("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: query.trim(),
          search_depth: "basic",
          max_results: 5,
          include_answer: false,
          include_raw_content: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // If Tavily returns transient 502/503/504 error, retry once
      if (
        (response.status === 502 || response.status === 503 || response.status === 504) &&
        attempt < 2
      ) {
        console.warn(
          `[Tavily] HTTP ${response.status} for query "${query}". Retrying in 1000ms...`
        );
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      break;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      lastError = err;

      if (err instanceof ResearchAgentError) {
        throw err;
      }

      // Retry once on transient network drops
      if (attempt < 2 && !(err instanceof Error && err.name === "AbortError")) {
        console.warn(
          `[Tavily] Connection glitch for "${query}". Retrying in 1000ms...`
        );
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      if (err instanceof Error && err.name === "AbortError") {
        throw new ResearchAgentError(
          "TAVILY_TIMEOUT",
          "Tavily search timed out while retrieving web evidence.",
          504
        );
      }

      const message = err instanceof Error ? err.message : String(err);
      throw new ResearchAgentError(
        "TAVILY_ERROR",
        `Encountered an error communicating with Tavily: ${message}`,
        502
      );
    }
  }

  if (!response) {
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new ResearchAgentError(
      "TAVILY_ERROR",
      `Encountered an error communicating with Tavily: ${message}`,
      502
    );
  }

  if (response.status === 429) {
    throw new ResearchAgentError(
      "TAVILY_RATE_LIMIT",
      "Tavily search rate limit reached. Please try again shortly.",
      429
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new ResearchAgentError(
      "TAVILY_ERROR",
      "Tavily authentication failed. Please verify TAVILY_API_KEY.",
      502
    );
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new ResearchAgentError(
      "TAVILY_ERROR",
      `Tavily search returned HTTP ${response.status}${
        errText ? `: ${errText.slice(0, 120)}` : ""
      }.`,
      502
    );
  }

  const payload = (await response.json().catch(() => null)) as TavilyRawResponse | null;
  const rawResults = Array.isArray(payload?.results) ? payload!.results : [];

  const normalized: ResearchSource[] = [];
  for (const item of rawResults) {
    if (!item || typeof item.url !== "string" || !item.url.trim()) continue;
    const normUrl = normalizeUrlForComparison(item.url);
    if (!normUrl) continue;

    const domain = extractDomain(item.url);
    if (!domain) continue;

    const rawContent = typeof item.content === "string" ? item.content.trim() : "";
    const snippet = rawContent.length > 280 ? `${rawContent.slice(0, 277)}...` : rawContent;

    normalized.push({
      title:
        typeof item.title === "string" && item.title.trim()
          ? item.title.trim()
          : domain,
      url: item.url.trim(),
      domain,
      snippet: snippet || undefined,
      content: rawContent || undefined,
      score: typeof item.score === "number" ? Number(item.score.toFixed(3)) : undefined,
      query: query.trim(),
    });
  }

  return normalized;
}

/**
 * Step 3 — Executes all generated research queries against Tavily Search and deduplicates sources.
 * Resilient against single-query network glitches so remaining successful queries are preserved.
 */
export async function searchTavily(
  queries: string[],
  options: ResearchAgentOptions = {}
): Promise<ResearchSource[]> {
  const apiKey = (options.tavilyApiKey ?? process.env.TAVILY_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new ResearchAgentError(
      "MISSING_TAVILY_KEY",
      "Server configuration error: TAVILY_API_KEY is not configured.",
      500
    );
  }

  const cleanQueries = queries.map((q) => q.trim()).filter(Boolean);
  if (cleanQueries.length === 0) {
    return [];
  }

  const sourceByNormalizedUrl = new Map<string, ResearchSource>();
  let lastFatalError: unknown = null;
  let successfulQueryCount = 0;

  for (const query of cleanQueries) {
    try {
      const results = await searchTavilyQuery(query, options);
      successfulQueryCount++;

      for (const source of results) {
        const normUrl = normalizeUrlForComparison(source.url);
        if (!normUrl) continue;

        const existing = sourceByNormalizedUrl.get(normUrl);
        if (!existing) {
          sourceByNormalizedUrl.set(normUrl, source);
        } else {
          // Keep higher relevance score or fuller content
          const existingScore = existing.score ?? 0;
          const newScore = source.score ?? 0;
          if (newScore > existingScore) {
            sourceByNormalizedUrl.set(normUrl, source);
          }
        }
      }
    } catch (err: unknown) {
      console.warn(
        `[Tavily] Query "${query}" failed: ${err instanceof Error ? err.message : String(err)}`
      );
      lastFatalError = err;

      // Fail fast on auth or rate-limit errors
      if (
        err instanceof ResearchAgentError &&
        (err.code === "MISSING_TAVILY_KEY" || err.code === "TAVILY_RATE_LIMIT")
      ) {
        throw err;
      }
    }
  }

  // If ALL queries failed and zero sources were gathered, throw the recorded error
  if (successfulQueryCount === 0 && lastFatalError) {
    throw lastFatalError;
  }

  return Array.from(sourceByNormalizedUrl.values());
}
