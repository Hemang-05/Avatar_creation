"use client";

import React from "react";
import { Message } from "@/types/chat";
import { ProcessingStatus } from "./ProcessingStatus";
import { FinalVideoResultCard } from "./FinalVideoResultCard";
import { ExtractedArticleCard } from "./ExtractedArticleCard";
import { ResearchResultCard } from "./ResearchResultCard";
import { ScriptResultCard } from "./ScriptResultCard";
import { AudioResultCard } from "./AudioResultCard";
import { AvatarResultCard } from "./AvatarResultCard";
import { Globe, Sparkles, User, ExternalLink } from "lucide-react";

interface ChatMessageProps {
  message: Message;
  onRegenerate?: (articleUrl: string) => void;
}

export function ChatMessage({ message, onRegenerate }: ChatMessageProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="max-w-[85%] sm:max-w-lg rounded-2xl bg-zinc-800/90 border border-zinc-700/60 p-3.5 sm:p-4 text-white shadow-sm">
          <div className="flex items-center gap-2 mb-1.5 text-xs text-zinc-400 font-medium">
            <User className="w-3.5 h-3.5 text-zinc-400" />
            <span>You</span>
            {message.metadata?.domain && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-700/50">
                {message.metadata.domain}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 group">
            <Globe className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <a
              href={message.content}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs sm:text-sm font-mono text-blue-300 hover:text-blue-200 underline underline-offset-2 break-all line-clamp-2 inline-flex items-center gap-1"
            >
              <span>{message.content}</span>
              <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 flex-shrink-0" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Assistant message rendering
  return (
    <div className="flex items-start gap-3 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Studio AI Avatar */}
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600/30 to-indigo-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-sm flex-shrink-0 mt-0.5">
        <Sparkles className="w-4 h-4" />
      </div>

      {/* Message Body */}
      <div className="flex-1 min-w-0 max-w-2xl space-y-3">
        {/* Text Message */}
        {message.type === "text" && message.content && (
          <div className="rounded-2xl bg-zinc-900/50 border border-white/[0.06] p-4 text-zinc-200 text-sm leading-relaxed whitespace-pre-line shadow-sm">
            {message.content}
          </div>
        )}

        {/* Status / Pipeline Message */}
        {message.type === "status" && (
          <ProcessingStatus
            title={message.content || "Analyzing & researching news story"}
            steps={message.metadata?.steps}
            currentStepIndex={message.metadata?.currentStepIndex}
            isProcessing={message.metadata?.isProcessing}
          />
        )}

        {/* Extracted Article Result (Phase 2) */}
        {message.type === "article" && message.metadata?.article && (
          <ExtractedArticleCard
            article={message.metadata.article}
            extractionMethod={message.metadata.extractionMethod}
          />
        )}

        {/* Verified Research Result (Phase 3) */}
        {message.type === "research" && message.metadata?.research && (
          <ResearchResultCard
            research={message.metadata.research}
            articleTitle={message.metadata.title}
          />
        )}

        {/* Presenter News Script Result (Phase 4) */}
        {message.type === "script" && message.metadata?.script && (
          <ScriptResultCard script={message.metadata.script} />
        )}

        {/* Synthesized Audio Result (Phase 5) */}
        {message.type === "audio" && message.metadata?.audio && (
          <AudioResultCard audio={message.metadata.audio} />
        )}

        {/* Talking Presenter Avatar Result (Phase 6) */}
        {message.type === "avatar" && message.metadata?.avatar && (
          <AvatarResultCard
            avatar={message.metadata.avatar}
            errorMessage={message.metadata.errorMessage}
          />
        )}

        {/* Final Composed Broadcast Video Result (Phase 7A) */}
        {message.type === "video" && message.metadata?.video && (
          <FinalVideoResultCard
            video={message.metadata.video}
            onRegenerate={onRegenerate}
          />
        )}
      </div>
    </div>
  );
}
