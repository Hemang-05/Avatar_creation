"use client";

import React, { useState } from "react";
import { Article, ExtractionMethod } from "@/types/article";
import {
  FileText,
  ExternalLink,
  User,
  Calendar,
  Globe,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ExtractedArticleCardProps {
  article: Article;
  extractionMethod?: ExtractionMethod;
  className?: string;
}

export function ExtractedArticleCard({
  article,
  extractionMethod = "readability",
  className,
}: ExtractedArticleCardProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(
        `Title: ${article.title}\nSource: ${article.source || "Unknown"}\n\n${article.content}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isLong = article.content.length > 700;
  const displayedContent = isExpanded || !isLong
    ? article.content
    : article.content.slice(0, 700).trim() + "...";

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-zinc-900/80 p-4 sm:p-5 backdrop-blur-md shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2 duration-300",
        className
      )}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-semibold tracking-tight text-white flex items-center gap-1.5">
              <span>Article Extracted Successfully</span>
            </h4>
            <span className="text-[11px] text-zinc-400">
              {article.wordCount} words • Ready for Phase 3 Research
            </span>
          </div>
        </div>

        {/* Extraction Method Badge & Actions */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium border",
              extractionMethod === "readability"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-orange-500/10 text-orange-400 border-orange-500/20"
            )}
            title={
              extractionMethod === "readability"
                ? "Extracted via local Mozilla Readability + JSDOM"
                : "Extracted via Firecrawl Scrape API v2 fallback"
            }
          >
            {extractionMethod === "readability" ? (
              <>
                <BookOpen className="w-3 h-3" />
                <span>Readability</span>
              </>
            ) : (
              <>
                <Flame className="w-3 h-3" />
                <span>Firecrawl</span>
              </>
            )}
          </span>

          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 border border-transparent hover:border-zinc-700/60 transition-colors cursor-pointer"
            title="Copy extracted article text"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Article Title */}
      <div className="mb-3">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-start gap-1.5 text-base sm:text-lg font-semibold text-zinc-100 hover:text-blue-400 transition-colors leading-snug tracking-tight"
        >
          <span>{article.title}</span>
          <ExternalLink className="w-3.5 h-3.5 text-zinc-400 group-hover:text-blue-400 mt-1 flex-shrink-0" />
        </a>
      </div>

      {/* Metadata Row: Source, Author, Published Date */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-400 mb-3.5 pb-3 border-b border-zinc-800/60 font-mono">
        {article.source && (
          <div className="flex items-center gap-1.5">
            <Globe className="w-3 h-3 text-zinc-500" />
            <span className="text-zinc-300">{article.source}</span>
          </div>
        )}

        {article.author && (
          <div className="flex items-center gap-1.5">
            <User className="w-3 h-3 text-zinc-500" />
            <span className="text-zinc-300">{article.author}</span>
          </div>
        )}

        {article.publishedAt && (
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3 text-zinc-500" />
            <span className="text-zinc-300">{article.publishedAt}</span>
          </div>
        )}
      </div>

      {/* Description / Summary Lead */}
      {article.description && (
        <div className="mb-3 p-3 rounded-xl bg-zinc-950/40 border border-zinc-800/60 text-xs sm:text-sm text-zinc-300 italic leading-relaxed">
          {article.description}
        </div>
      )}

      {/* Main Extracted Body Content */}
      <div className="relative">
        <div className="text-xs sm:text-sm text-zinc-300 leading-relaxed space-y-3 font-normal whitespace-pre-line">
          {displayedContent}
        </div>

        {/* Read More / Collapse Toggle */}
        {isLong && (
          <div className="mt-3 pt-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors py-1 cursor-pointer"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Collapse article text</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Show full extracted content ({article.wordCount} words)</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
