"use client";

import React, { useState } from "react";
import { NewsScript, ScriptSegmentType } from "@/types/script";
import {
  FileText,
  Clock,
  Mic,
  Copy,
  Check,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Radio,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ScriptResultCardProps {
  script: NewsScript;
  className?: string;
}

function getSegmentBadge(type: ScriptSegmentType) {
  switch (type) {
    case "hook":
      return {
        label: "Hook",
        className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
      };
    case "story":
      return {
        label: "What Happened",
        className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      };
    case "context":
      return {
        label: "Context",
        className: "bg-purple-500/15 text-purple-400 border-purple-500/30",
      };
    case "significance":
      return {
        label: "Significance",
        className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      };
    case "closing":
      return {
        label: "Closing",
        className: "bg-zinc-500/15 text-zinc-300 border-zinc-600/30",
      };
    default:
      return {
        label: type,
        className: "bg-zinc-800 text-zinc-300 border-zinc-700",
      };
  }
}

export function ScriptResultCard({ script, className }: ScriptResultCardProps) {
  const [copied, setCopied] = useState(false);
  const [showSegments, setShowSegments] = useState(false);

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(script.fullScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-zinc-900/80 p-4 sm:p-5 backdrop-blur-md shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4",
        className
      )}
    >
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-blue-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-sm">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-sm font-semibold tracking-tight text-white">
                Presenter Script Ready
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono capitalize bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                {script.tone} tone
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Generated with Gemini 3.5 Flash-Lite from verified research
            </p>
          </div>
        </div>

        {/* Copy Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 transition-colors cursor-pointer"
            title="Copy script text"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-zinc-400" />
                <span>Copy Script</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Script Title & Metadata Badges */}
      <div className="space-y-2">
        <div className="text-xs font-mono uppercase tracking-wider text-zinc-400">
          Broadcast Headline
        </div>
        <h3 className="text-sm sm:text-base font-semibold text-zinc-100 leading-snug">
          {script.title}
        </h3>

        {/* Metric Badges */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5 font-mono text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-950/60 border border-zinc-800 text-zinc-300">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>~{script.estimatedDurationSeconds}s airtime</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-950/60 border border-zinc-800 text-zinc-300">
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            <span>{script.wordCount} words</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-950/60 border border-zinc-800 text-zinc-300">
            <Tag className="w-3.5 h-3.5 text-purple-400" />
            <span>{script.usedClaimIds.length} verified claims cited</span>
          </div>
        </div>
      </div>

      {/* Spoken Script Body */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-zinc-300 uppercase">
            <Mic className="w-3.5 h-3.5 text-indigo-400" />
            <span>Spoken Presenter Text</span>
          </div>
          <span className="text-[11px] text-zinc-400 font-mono">
            150 words/min rate
          </span>
        </div>

        <div className="p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/90 text-sm sm:text-base text-zinc-100 leading-relaxed font-sans whitespace-pre-line shadow-inner">
          {script.fullScript}
        </div>
      </div>

      {/* Segment Breakdown Accordion */}
      {script.segments && script.segments.length > 0 && (
        <div className="pt-2 border-t border-zinc-800/80 space-y-2.5">
          <button
            onClick={() => setShowSegments(!showSegments)}
            className="w-full flex items-center justify-between text-left py-1 text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-1.5 font-mono uppercase text-zinc-400 group-hover:text-zinc-200">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Broadcast Segment Breakdown ({script.segments.length} segments)</span>
            </div>
            {showSegments ? (
              <ChevronUp className="w-4 h-4 text-zinc-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-400" />
            )}
          </button>

          {showSegments && (
            <div className="space-y-2 pt-1 animate-in fade-in duration-200">
              {script.segments.map((seg, idx) => {
                const badge = getSegmentBadge(seg.type);
                return (
                  <div
                    key={seg.id || idx}
                    className="rounded-xl bg-zinc-950/50 border border-zinc-800/70 p-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border",
                            badge.className
                          )}
                        >
                          {badge.label}
                        </span>
                        <span className="text-[11px] font-mono text-zinc-400">
                          {seg.id}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-zinc-400">
                        ~{seg.estimatedDurationSeconds}s
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed">
                      {seg.text}
                    </p>

                    {seg.claimIds && seg.claimIds.length > 0 && (
                      <div className="flex items-center gap-1.5 pt-1 text-[10px] font-mono text-zinc-400">
                        <span>Cites:</span>
                        {seg.claimIds.map((cid) => (
                          <span
                            key={cid}
                            className="px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-indigo-300"
                          >
                            {cid}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

