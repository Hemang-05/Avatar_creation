"use client";

import React from "react";
import { SUGGESTIONS } from "@/lib/simulation";
import { SuggestionCard } from "@/types/chat";
import { ArrowUpRight, Trophy, Flame, Activity, Zap, PlaySquare } from "lucide-react";

interface EmptyStateProps {
  onSelectSuggestion: (url: string) => void;
}

export function EmptyState({ onSelectSuggestion }: EmptyStateProps) {
  const getCategoryIcon = (category: SuggestionCard["category"]) => {
    switch (category) {
      case "Cricket news":
        return <Trophy className="w-4 h-4 text-amber-400" />;
      case "Football news":
        return <Flame className="w-4 h-4 text-emerald-400" />;
      case "Tennis news":
        return <Activity className="w-4 h-4 text-sky-400" />;
      case "Formula 1 news":
        return <Zap className="w-4 h-4 text-red-400" />;
      default:
        return <PlaySquare className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-2xl mx-auto text-center animate-in fade-in duration-500">
      {/* Editorial Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs font-medium mb-6 shadow-inner">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        Next-Generation Newsroom AI
      </div>

      {/* Main Title */}
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white mb-3">
        Turn any news story into a video
      </h1>

      {/* Description */}
      <p className="text-sm sm:text-base text-zinc-400 max-w-lg mb-10 leading-relaxed">
        Paste a news article URL and NewsAI Studio will eventually research it, write a short script, and generate an AI presenter video.
      </p>

      {/* Suggested Topics / Examples */}
      <div className="w-full text-left">
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-xs uppercase tracking-wider font-mono text-zinc-300">
            Try with an example story
          </span>
          <span className="text-[11px] text-zinc-300">Click to populate composer</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SUGGESTIONS.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectSuggestion(item.sampleUrl)}
              className="group relative p-3.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-white/[0.06] hover:border-blue-500/30 transition-all duration-200 text-left flex flex-col justify-between hover:shadow-lg hover:shadow-blue-500/5 cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                    {getCategoryIcon(item.category)}
                    <span>{item.category}</span>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-blue-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </div>
                <h3 className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors line-clamp-1 mb-1">
                  {item.title}
                </h3>
                <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-zinc-800/60 flex items-center gap-1 text-[11px] font-mono text-zinc-300 truncate">
                <span className="text-zinc-300 truncate">{item.sampleUrl}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
