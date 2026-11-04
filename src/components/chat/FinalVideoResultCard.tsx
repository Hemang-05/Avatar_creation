"use client";

import React, { useState } from "react";
import { VideoMetadata } from "@/types/chat";
import {
  Download,
  Share2,
  Check,
  RotateCw,
  Tv,
  Film,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FinalVideoResultCardProps {
  video: VideoMetadata;
  onRegenerate?: (articleUrl: string) => void;
  className?: string;
}

export function FinalVideoResultCard({
  video,
  onRegenerate,
  className,
}: FinalVideoResultCardProps) {
  const [copiedLinkToast, setCopiedLinkToast] = useState(false);

  const handleShare = () => {
    if (typeof window !== "undefined" && navigator.clipboard) {
      const shareUrl = video.videoUrl?.startsWith("http")
        ? video.videoUrl
        : `${window.location.origin}${video.videoUrl || ""}`;
      navigator.clipboard.writeText(shareUrl);
      setCopiedLinkToast(true);
      setTimeout(() => setCopiedLinkToast(false), 2500);
    }
  };

  const formattedDuration = video.durationSeconds
    ? `${Math.floor(video.durationSeconds / 60)}:${String(Math.floor(video.durationSeconds % 60)).padStart(2, "0")}`
    : video.duration || "0:30";

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-zinc-900/90 p-4 sm:p-5 backdrop-blur-md shadow-xl transition-all animate-in fade-in slide-in-from-bottom-2 duration-300",
        className
      )}
    >
      {/* Header Badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider uppercase text-emerald-400">
                Final News Broadcast
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                1080p • 16:9
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Composed with burned-in headline, lower-third, and synchronized captions
            </p>
          </div>
        </div>

        {/* Duration & Aspect Ratio Badges */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700/60">
            <Film className="w-3 h-3 text-zinc-400" />
            {formattedDuration}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700/60">
            <Tv className="w-3 h-3 text-zinc-400" />
            1920x1080
          </span>
        </div>
      </div>

      {/* Headline */}
      <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-snug mb-3">
        {video.title}
      </h3>

      {/* 16:9 Video Player */}
      <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-white/[0.08] shadow-inner mb-4">
        {video.videoUrl ? (
          <video
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-contain"
            src={video.videoUrl}
          >
            Your browser does not support the video tag.
          </video>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs">
            Video source unavailable
          </div>
        )}
      </div>

      {/* Video Composition Details Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2.5 px-3 rounded-xl bg-zinc-950/60 border border-zinc-800/60 text-[11px] mb-4">
        <div>
          <span className="text-zinc-500 block text-[10px] uppercase font-mono">Format</span>
          <span className="text-zinc-200 font-medium">H.264 / MP4 (yuv420p)</span>
        </div>
        <div>
          <span className="text-zinc-500 block text-[10px] uppercase font-mono">Audio Track</span>
          <span className="text-zinc-200 font-medium">ElevenLabs (192kbps)</span>
        </div>
        <div>
          <span className="text-zinc-500 block text-[10px] uppercase font-mono">Captions</span>
          <span className="text-emerald-400 font-medium">Burned-in (ASS)</span>
        </div>
        <div>
          <span className="text-zinc-500 block text-[10px] uppercase font-mono">Source Domain</span>
          <span className="text-zinc-200 font-medium truncate block">
            {video.sourceDomain || "NewsAI Studio"}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/60">
        <div className="flex items-center gap-2">
          {video.videoUrl && (
            <a
              href={video.videoUrl}
              download={`${video.title.slice(0, 30).replace(/[^a-zA-Z0-9_-]/g, "_")}_newsai.mp4`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download MP4</span>
            </a>
          )}
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-medium border border-zinc-700/60 transition-colors"
          >
            {copiedLinkToast ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Link copied!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-zinc-400" />
                <span>Share Video</span>
              </>
            )}
          </button>
        </div>

        {onRegenerate && video.articleUrl && (
          <button
            type="button"
            onClick={() => onRegenerate(video.articleUrl!)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Regenerate Broadcast</span>
          </button>
        )}
      </div>
    </div>
  );
}
