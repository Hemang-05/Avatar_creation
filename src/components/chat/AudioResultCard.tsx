"use client";

import React from "react";
import { AudioMetadata } from "@/types/tts";
import { Volume2, Radio, Clock, FileText, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioResultCardProps {
  audio: AudioMetadata;
  className?: string;
}

export function AudioResultCard({ audio, className }: AudioResultCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-zinc-900/80 p-4 sm:p-5 backdrop-blur-md shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4",
        className
      )}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-sm">
            <Volume2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-sm font-semibold tracking-tight text-white">
                Presenter Voice Generated
              </h4>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-2.5 h-2.5" />
                <span>Ready</span>
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Synthesized broadcast audio ready for playback
            </p>
          </div>
        </div>

        {/* Provider Badge */}
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-purple-500/10 text-purple-300 border border-purple-500/25">
            <Radio className="w-3 h-3" />
            <span className="capitalize">{audio.provider || "ElevenLabs"}</span>
          </span>
        </div>
      </div>

      {/* Script Title & Info */}
      {(audio.scriptTitle || audio.wordCount || audio.estimatedDurationSeconds) && (
        <div className="space-y-2">
          {audio.scriptTitle && (
            <h3 className="text-sm sm:text-base font-semibold text-zinc-100 leading-snug">
              {audio.scriptTitle}
            </h3>
          )}

          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            {typeof audio.estimatedDurationSeconds === "number" && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-950/60 border border-zinc-800 text-zinc-300">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                <span>~{audio.estimatedDurationSeconds}s est.</span>
              </div>
            )}

            {typeof audio.wordCount === "number" && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-950/60 border border-zinc-800 text-zinc-300">
                <FileText className="w-3.5 h-3.5 text-blue-400" />
                <span>{audio.wordCount} words</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Native HTML5 Audio Player */}
      <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800/90">
        <audio
          controls
          preload="metadata"
          src={audio.audioUrl}
          className="w-full h-10 outline-none"
        >
          Your browser does not support the HTML5 audio element.
        </audio>
      </div>
    </div>
  );
}

