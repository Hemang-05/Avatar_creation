"use client";

import React from "react";
import { AvatarMetadata } from "@/types/avatar";
import {
  Video,
  UserCheck,
  Clock,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AvatarResultCardProps {
  avatar: AvatarMetadata;
  errorMessage?: string;
  className?: string;
}

export function AvatarResultCard({
  avatar,
  errorMessage,
  className,
}: AvatarResultCardProps) {
  const isError = avatar.status === "failed" || Boolean(errorMessage);
  const providerLabel =
    avatar.provider?.toLowerCase() === "did" ? "D-ID" : avatar.provider || "D-ID";

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-zinc-900/80 p-4 sm:p-5 backdrop-blur-md shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4",
        isError && "border-red-500/30 bg-red-950/10",
        className
      )}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shadow-sm",
              isError
                ? "bg-red-500/15 border border-red-500/30 text-red-400"
                : "bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400"
            )}
          >
            {isError ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <Video className="w-4 h-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-sm font-semibold tracking-tight text-white">
                {isError
                  ? "Presenter Video Generation Failed"
                  : "AI Presenter Video Ready"}
              </h4>
              {!isError && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  <span>Avatar video ready</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400">
              {isError
                ? errorMessage || "Unable to complete talking-head lip-sync synthesis"
                : "Lip-synced talking presenter broadcast generated from ElevenLabs voice"}
            </p>
          </div>
        </div>

        {/* Provider Badge */}
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
            <Sparkles className="w-3 h-3" />
            <span>{providerLabel} Talks</span>
          </span>
        </div>
      </div>

      {/* Script Title & Presenter Metadata */}
      <div className="space-y-2">
        {avatar.scriptTitle && (
          <h3 className="text-sm sm:text-base font-semibold text-zinc-100 leading-snug">
            {avatar.scriptTitle}
          </h3>
        )}

        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-950/60 border border-zinc-800 text-zinc-300">
            <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Presenter: {avatar.presenterName || "Hemang"}</span>
          </div>

          {typeof avatar.durationSeconds === "number" && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-950/60 border border-zinc-800 text-zinc-300">
              <Clock className="w-3.5 h-3.5 text-teal-400" />
              <span>{avatar.durationSeconds}s</span>
            </div>
          )}

          {avatar.providerVideoId && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-950/60 border border-zinc-800 text-zinc-400 text-[11px]">
              <span>ID: {avatar.providerVideoId}</span>
            </div>
          )}
        </div>
      </div>

      {/* Native HTML5 Video Player */}
      {!isError && avatar.videoUrl && (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-xl bg-zinc-950 border border-zinc-800/90 shadow-inner">
            <video
              controls
              playsInline
              preload="metadata"
              src={avatar.videoUrl}
              className="w-full max-h-[420px] object-contain bg-black outline-none"
            >
              Your browser does not support the HTML5 video element.
            </video>
          </div>

          <div className="flex justify-end">
            <a
              href={avatar.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-emerald-300 transition-colors"
            >
              <span>Open raw MP4 stream</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

