"use client";

import React from "react";
import { Sparkles, RotateCcw } from "lucide-react";

interface HeaderProps {
  hasMessages?: boolean;
  onReset?: () => void;
  isProcessing?: boolean;
}

export function Header({ hasMessages, onReset, isProcessing }: HeaderProps) {
  return (
    <header className="w-full border-b border-white/[0.08] bg-[#090A0F]/90 backdrop-blur-md sticky top-0 z-30 transition-colors">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand Identity */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-sm shadow-blue-500/10">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm sm:text-base tracking-tight text-white">
                NewsAI Studio
              </span>
              <span className="text-[10px] font-mono tracking-wider uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                Phase 1
              </span>
            </div>
            <span className="text-xs text-zinc-400 font-normal">
              Turn news into short-form video
            </span>
          </div>
        </div>

        {/* Status Indicator & Action */}
        <div className="flex items-center gap-4">
          {hasMessages && (
            <button
              onClick={onReset}
              disabled={isProcessing}
              title="Start a new news story"
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-zinc-800/60 border border-transparent hover:border-zinc-700/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Story</span>
            </button>
          )}

          <div
            className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium"
            title="System operational"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Online</span>
          </div>
        </div>
      </div>
    </header>
  );
}
