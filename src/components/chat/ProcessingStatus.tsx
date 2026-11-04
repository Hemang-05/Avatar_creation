"use client";

import React from "react";
import { ProcessingStep } from "@/types/chat";
import { Check, Loader2, Circle, Clapperboard, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProcessingStatusProps {
  steps?: ProcessingStep[];
  currentStepIndex?: number;
  isProcessing?: boolean;
  title?: string;
  className?: string;
}

export function ProcessingStatus({
  steps = [],
  isProcessing = false,
  title = "Analyzing & researching news story",
  className,
}: ProcessingStatusProps) {
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const isAllComplete = completedCount === steps.length && steps.length > 0;
  const hasError = steps.some((s) => s.status === "error");
  const isArticleExtracted = steps.some(
    (s) => s.id === "extracting_article" && s.status === "completed"
  );
  const isResearching = steps.some(
    (s) =>
      (s.id === "researching_story" || s.id === "verifying_claims") &&
      s.status === "processing"
  );
  const isGeneratingScript = steps.some(
    (s) => s.id === "generating_script" && s.status === "processing"
  );
  const isGeneratingVoice = steps.some(
    (s) => s.id === "generating_voice" && s.status === "processing"
  );
  const isGeneratingAvatar = steps.some(
    (s) => s.id === "generating_avatar" && s.status === "processing"
  );

  const getSubtitle = () => {
    if (hasError) return "Pipeline halted due to an issue";
    if (isGeneratingAvatar)
      return "Animating presenter portrait with lip-sync via D-ID...";
    if (isGeneratingVoice) return "Synthesizing presenter voice audio via ElevenLabs TTS...";
    if (isGeneratingScript) return "Writing broadcast presenter script with Gemini...";
    if (isResearching) return "Researching story & cross-checking claims via Gemini + Tavily...";
    if (isProcessing) return "Extracting and parsing editorial news article...";
    if (isAllComplete) return "Avatar video ready • Presenter broadcast package complete";
    if (isArticleExtracted) return "Article extracted • Initializing research agent";
    return "Pipeline initialized";
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-zinc-900/60 p-4 sm:p-5 backdrop-blur-sm shadow-sm transition-all",
        hasError && "border-red-500/30 bg-red-950/10",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
              hasError
                ? "bg-red-500/15 text-red-400 border border-red-500/30"
                : isAllComplete
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : "bg-blue-500/15 text-blue-400 border border-blue-500/30"
            )}
          >
            {hasError ? (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            ) : isAllComplete ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <Clapperboard className="w-4 h-4 text-blue-400 animate-pulse" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-medium text-white tracking-tight">{title}</h4>
            <p className="text-xs text-zinc-400">{getSubtitle()}</p>
          </div>
        </div>

        {/* Status indicator pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium border border-zinc-800 bg-zinc-950/50">
          {hasError ? (
            <span className="text-red-400 font-semibold">Error</span>
          ) : isAllComplete ? (
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <Check className="w-3 h-3" /> Avatar video ready
            </span>
          ) : isGeneratingAvatar ? (
            <span className="text-teal-400 font-semibold flex items-center gap-1">
              Generating presenter...
            </span>
          ) : isGeneratingVoice ? (
            <span className="text-purple-400 font-semibold flex items-center gap-1">
              Generating voice...
            </span>
          ) : isGeneratingScript ? (
            <span className="text-indigo-400 font-semibold flex items-center gap-1">
              Writing script...
            </span>
          ) : isArticleExtracted ? (
            <span className="text-blue-400 font-semibold flex items-center gap-1">
              Researching...
            </span>
          ) : (
            <span className="text-zinc-400">
              {completedCount}/{steps.length}
            </span>
          )}
        </div>
      </div>

      {/* Steps List */}
      <div className="space-y-2.5">
        {steps.map((step) => {
          const isDone = step.status === "completed";
          const isCurrent = step.status === "processing";
          const isPending = step.status === "pending";
          const isStepError = step.status === "error";

          return (
            <div
              key={step.id}
              className={cn(
                "flex items-start gap-3 p-2 rounded-xl transition-all duration-300",
                isCurrent && "bg-blue-500/[0.06] border border-blue-500/20",
                isStepError && "bg-red-500/[0.06] border border-red-500/20",
                isDone && "bg-transparent",
                isPending && "opacity-40"
              )}
            >
              {/* Step Icon */}
              <div className="mt-0.5 flex-shrink-0">
                {isDone && (
                  <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                  </div>
                )}
                {isCurrent && (
                  <div className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center">
                    <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                  </div>
                )}
                {isStepError && (
                  <div className="w-4 h-4 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
                    <AlertTriangle className="w-2.5 h-2.5 stroke-[2.5]" />
                  </div>
                )}
                {isPending && (
                  <div className="w-4 h-4 flex items-center justify-center text-zinc-600">
                    <Circle className="w-3 h-3" />
                  </div>
                )}
              </div>

              {/* Step Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-xs font-medium tracking-tight",
                      isDone && "text-zinc-200",
                      isCurrent && "text-blue-300 font-semibold",
                      isStepError && "text-red-300 font-semibold",
                      isPending && "text-zinc-500"
                    )}
                  >
                    {step.label}
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] uppercase font-mono tracking-wider text-blue-400 animate-pulse">
                      In progress...
                    </span>
                  )}
                  {isDone && (
                    <span className="text-[10px] font-mono text-zinc-400">Done</span>
                  )}
                  {isPending && (
                    <span className="text-[10px] font-mono text-zinc-600">Pending</span>
                  )}
                  {isStepError && (
                    <span className="text-[10px] font-mono text-red-400">Failed</span>
                  )}
                </div>

                {step.description && (
                  <p
                    className={cn(
                      "text-[11px] mt-0.5 leading-tight truncate",
                      isCurrent ? "text-zinc-300" : "text-zinc-500"
                    )}
                  >
                    {step.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
