import { ProcessingStep, SuggestionCard, VideoMetadata } from "@/types/chat";
import { extractStoryTitleFromUrl } from "./urlValidation";

/**
 * Standard processing pipeline steps for NewsAI Studio (Phases 2–6).
 * Supports:
 * - Extracting article... -> Article extracted
 * - Researching story... -> Story researched
 * - Verifying claims... -> Research complete
 * - Generating presenter script... -> Script generated
 * - Generating voice... -> Voice generated
 * - Generating presenter... -> Avatar video ready
 * (Final video composition is reserved for Phase 7.)
 */
export const DEFAULT_PIPELINE_STEPS: Omit<ProcessingStep, "status">[] = [
  {
    id: "extracting_article",
    label: "Extracting article...",
    description: "Parsing editorial body, author, and key timestamps",
  },
  {
    id: "researching_story",
    label: "Researching story...",
    description: "Identifying factual claims and searching web sources via Tavily",
  },
  {
    id: "verifying_claims",
    label: "Verifying claims...",
    description: "Cross-checking evidence and resolving conflicts with Gemini",
  },
  {
    id: "generating_script",
    label: "Generating presenter script...",
    description: "Synthesizing verified claims into a broadcast-ready news script",
  },
  {
    id: "generating_voice",
    label: "Generating voice...",
    description: "Converting presenter script into speech via ElevenLabs TTS",
  },
];

export const SUGGESTIONS: SuggestionCard[] = [
  {
    id: "cricket",
    category: "Cricket news",
    title: "India Cricket Team Report",
    description: "Match record, squad developments, and championship milestones",
    sampleUrl: "https://en.wikipedia.org/wiki/India_national_cricket_team",
    icon: "cricket",
  },
  {
    id: "football",
    category: "Football news",
    title: "Champions League Overview",
    description: "European club tournament history, key fixtures, and tournament format",
    sampleUrl: "https://en.wikipedia.org/wiki/UEFA_Champions_League",
    icon: "football",
  },
  {
    id: "tennis",
    category: "Tennis news",
    title: "Wimbledon Championships",
    description: "Grand slam tournament traditions, grass court records, and finals",
    sampleUrl: "https://en.wikipedia.org/wiki/The_Championships,_Wimbledon",
    icon: "tennis",
  },
  {
    id: "f1",
    category: "Formula 1 news",
    title: "Monaco Grand Prix Feature",
    description: "Circuit de Monaco racing heritage, legendary street circuit dynamics",
    sampleUrl: "https://en.wikipedia.org/wiki/Monaco_Grand_Prix",
    icon: "f1",
  },
];

/**
 * Creates mock video metadata based on the article URL (retained for future video phase).
 */
export function createMockVideoResult(articleUrl: string): VideoMetadata {
  const dynamicTitle = extractStoryTitleFromUrl(articleUrl);
  return {
    title: dynamicTitle || "Breaking Sports Update: Top Headlines Today",
    duration: "01:00",
    videoUrl: "#mock-stream",
    thumbnailUrl: "/mock_news_anchor.jpg",
    verticalThumbnailUrl: "/mock_news_anchor_vertical.jpg",
    aspectRatio: "16:9",
    articleUrl,
    sourceDomain: new URL(articleUrl).hostname.replace(/^www\./, ""),
    summary:
      "A fast-paced 60-second broadcast breakdown capturing key highlights, official reactions, and pivotal moments from the story.",
  };
}
