import { Article, ExtractionMethod } from "./article";
import { ResearchResult } from "./research";
import { NewsScript } from "./script";
import { AudioMetadata } from "./tts";
import { AvatarMetadata } from "./avatar";

export type MessageRole = "user" | "assistant";

export type MessageType =
  | "text"
  | "status"
  | "video"
  | "article"
  | "research"
  | "script"
  | "audio"
  | "avatar";

export type StepState = "pending" | "processing" | "completed" | "error";

export interface ProcessingStep {
  id: string;
  label: string;
  status: StepState;
  durationMs?: number;
  description?: string;
}

export interface VideoMetadata {
  title: string;
  duration: string; // e.g. "01:00"
  videoUrl?: string;
  thumbnailUrl?: string;
  verticalThumbnailUrl?: string;
  aspectRatio?: "16:9" | "9:16";
  articleUrl?: string;
  sourceDomain?: string;
  summary?: string;
  videoId?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  format?: string;
  generatedAt?: string;
}

export interface MessageMetadata {
  articleUrl?: string;
  duration?: string;
  videoUrl?: string;
  domain?: string;
  title?: string;
  steps?: ProcessingStep[];
  currentStepIndex?: number;
  isProcessing?: boolean;
  video?: VideoMetadata;
  article?: Article;
  extractionMethod?: ExtractionMethod;
  research?: ResearchResult;
  script?: NewsScript;
  audio?: AudioMetadata;
  avatar?: AvatarMetadata;
  errorMessage?: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  type: MessageType;
  content?: string;
  metadata?: MessageMetadata;
  createdAt: string;
}

export interface SuggestionCard {
  id: string;
  category: "Cricket news" | "Football news" | "Tennis news" | "Formula 1 news";
  title: string;
  description: string;
  sampleUrl: string;
  icon: string;
}
