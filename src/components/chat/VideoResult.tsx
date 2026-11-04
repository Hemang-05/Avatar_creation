"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { VideoMetadata } from "@/types/chat";
import {
  Play,
  Pause,
  Download,
  RotateCw,
  Clock,
  Sparkles,
  Check,
  Share2,
  Volume2,
  VolumeX,
  Maximize2,
  Smartphone,
  Tv,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoResultProps {
  video: VideoMetadata;
  onRegenerate?: (articleUrl: string) => void;
  className?: string;
}

export function VideoResult({ video, onRegenerate, className }: VideoResultProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSeconds, setPlaybackSeconds] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [selectedFormat, setSelectedFormat] = useState<"16:9" | "9:16">("16:9");
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<boolean>(false);
  const [copiedLinkToast, setCopiedLinkToast] = useState<boolean>(false);

  const totalDurationSeconds = 60; // 01:00

  // Simulated player playback progress
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setPlaybackSeconds((prev) => {
          if (prev >= totalDurationSeconds) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  const handleDownload = () => {
    setDownloadSuccessToast(true);
    setTimeout(() => setDownloadSuccessToast(false), 3000);
  };

  const handleShare = () => {
    if (video.articleUrl && navigator.clipboard) {
      navigator.clipboard.writeText(video.articleUrl);
    }
    setCopiedLinkToast(true);
    setTimeout(() => setCopiedLinkToast(false), 2500);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const progressPercent = (playbackSeconds / totalDurationSeconds) * 100;
  const currentThumbnail =
    selectedFormat === "9:16"
      ? video.verticalThumbnailUrl || "/mock_news_anchor_vertical.jpg"
      : video.thumbnailUrl || "/mock_news_anchor.jpg";

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-zinc-900/80 p-4 sm:p-5 backdrop-blur-md shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2 duration-300",
        className
      )}
    >
      {/* Ready Badge & Headline */}
      <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-xs font-semibold tracking-wider uppercase text-emerald-400">
              Your video is ready
            </span>
          </div>
        </div>

        {/* Format Selector: 16:9 Landscape vs 9:16 Mobile Short */}
        <div className="flex items-center bg-zinc-950/60 p-0.5 rounded-lg border border-zinc-800 text-[11px]">
          <button
            onClick={() => setSelectedFormat("16:9")}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md transition-colors",
              selectedFormat === "16:9"
                ? "bg-zinc-800 text-white font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            )}
            title="16:9 Broadcast Landscape"
          >
            <Tv className="w-3 h-3" />
            <span className="hidden sm:inline">16:9</span>
          </button>
          <button
            onClick={() => setSelectedFormat("9:16")}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md transition-colors",
              selectedFormat === "9:16"
                ? "bg-zinc-800 text-white font-medium"
                : "text-zinc-400 hover:text-zinc-200"
            )}
            title="9:16 Short-Form Reel / TikTok"
          >
            <Smartphone className="w-3 h-3" />
            <span className="hidden sm:inline">9:16</span>
          </button>
        </div>
      </div>

      {/* Video Preview Container */}
      <div
        className={cn(
          "relative overflow-hidden rounded-xl bg-black border border-white/10 group shadow-md transition-all",
          selectedFormat === "16:9" ? "aspect-video w-full" : "aspect-[9/16] max-w-xs mx-auto"
        )}
      >
        {/* Background Image / Thumbnail */}
        <Image
          src={currentThumbnail}
          alt={video.title}
          fill
          priority
          className={cn(
            "object-cover transition-transform duration-500",
            isPlaying ? "scale-105" : "scale-100"
          )}
        />

        {/* Vignette / Studio Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/35 pointer-events-none" />

        {/* Live Broadcast Studio Watermark */}
        <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none z-10">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-red-600 text-white shadow">
            LIVE BROADCAST
          </span>
          <span className="text-[11px] font-mono text-white/90 drop-shadow backdrop-blur-sm bg-black/40 px-1.5 py-0.5 rounded">
            AI Studio Elena
          </span>
        </div>

        {/* Duration / Format Tag */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 pointer-events-none z-10">
          <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[11px] font-mono text-white border border-white/10">
            <Clock className="w-3 h-3 text-zinc-300" />
            <span>01:00</span>
          </div>
        </div>

        {/* Center Play / Pause Overlay Button */}
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause video" : "Play video"}
            className={cn(
              "w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-200 shadow-xl cursor-pointer",
              isPlaying
                ? "bg-black/60 text-white border border-white/30 backdrop-blur-md opacity-0 group-hover:opacity-100"
                : "bg-blue-600/90 text-white hover:bg-blue-500 hover:scale-105 border border-white/20"
            )}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 fill-current" />
            ) : (
              <Play className="w-6 h-6 fill-current translate-x-0.5" />
            )}
          </button>
        </div>

        {/* Audio Waveform simulation when playing */}
        {isPlaying && (
          <div className="absolute bottom-12 left-4 right-4 flex items-center gap-1 z-10 pointer-events-none">
            <div className="flex items-center gap-0.5 h-4">
              {[40, 70, 90, 50, 80, 100, 60, 85, 45, 95].map((h, i) => (
                <span
                  key={i}
                  className="w-1 bg-blue-400 rounded-full animate-pulse"
                  style={{
                    height: `${h}%`,
                    animationDelay: `${i * 90}ms`,
                  }}
                />
              ))}
            </div>
            <span className="text-[11px] font-mono text-blue-200 ml-2 drop-shadow">
              Synthesized Audio Active
            </span>
          </div>
        )}

        {/* Bottom Player Scrub Bar */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 to-transparent p-3 pt-6 z-10">
          <div className="relative w-full h-1.5 bg-white/20 rounded-full overflow-hidden mb-2 cursor-pointer">
            <div
              className="h-full bg-blue-500 transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-300">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="hover:text-white transition-colors"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
              <span>
                {formatTime(playbackSeconds)} / {video.duration}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 font-sans">1080p AI Video</span>
              <button
                onClick={togglePlay}
                className="hover:text-white transition-colors"
                title="Fullscreen preview"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Video Details & Meta */}
      <div className="mt-3.5 pt-1">
        <h3 className="text-base font-semibold text-white tracking-tight leading-snug line-clamp-2">
          {video.title}
        </h3>
        {video.summary && (
          <p className="mt-1 text-xs text-zinc-400 line-clamp-2 leading-relaxed">
            {video.summary}
          </p>
        )}
      </div>

      {/* Action Controls Bar */}
      <div className="mt-4 pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-sm transition-colors cursor-pointer"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play</span>
              </>
            )}
          </button>

          {/* Download Button UI */}
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700/80 text-zinc-200 hover:text-white text-xs font-medium border border-zinc-700/60 transition-colors cursor-pointer"
            title="Download MP4 video asset"
          >
            <Download className="w-3.5 h-3.5 text-zinc-400" />
            <span>Download</span>
          </button>

          {/* Regenerate Button UI */}
          <button
            onClick={() => video.articleUrl && onRegenerate && onRegenerate(video.articleUrl)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700/80 text-zinc-200 hover:text-white text-xs font-medium border border-zinc-700/60 transition-colors cursor-pointer"
            title="Regenerate video with alternate presenter pace"
          >
            <RotateCw className="w-3.5 h-3.5 text-zinc-400" />
            <span>Regenerate</span>
          </button>
        </div>

        {/* Share Button UI */}
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 text-xs transition-colors"
          title="Copy article link"
        >
          {copiedLinkToast ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Share</span>
            </>
          )}
        </button>
      </div>

      {/* Download Toast Notification */}
      {downloadSuccessToast && (
        <div className="mt-3 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-center justify-between animate-in fade-in">
          <span>Phase 1 Mock: Video package ready for export (1080p MP4).</span>
          <span className="font-mono text-[10px] text-blue-400">01:00</span>
        </div>
      )}
    </div>
  );
}
