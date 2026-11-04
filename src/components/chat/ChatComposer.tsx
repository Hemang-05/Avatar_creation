"use client";

import React, { useRef, useEffect } from "react";
import { ArrowUp, Link2, AlertCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatComposerProps {
  input: string;
  onChange: (value: string) => void;
  onSubmit: (url?: string) => boolean | void | Promise<boolean | void>;
  error: string | null;
  onErrorClear?: () => void;
  isProcessing?: boolean;
}

export function ChatComposer({
  input,
  onChange,
  onSubmit,
  error,
  onErrorClear,
  isProcessing = false,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height smoothly based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isProcessing && input.trim()) {
        onSubmit();
      }
    }
  };

  const handleClear = () => {
    onChange("");
    if (onErrorClear) onErrorClear();
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const isSendDisabled = !input.trim() || isProcessing;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4 sm:pb-6 pt-2">
      {/* Inline Validation Error Banner */}
      {error && (
        <div className="mb-2.5 px-3.5 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-between animate-in fade-in slide-in-from-bottom-1 duration-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          {onErrorClear && (
            <button
              onClick={onErrorClear}
              className="text-red-400/70 hover:text-red-300 transition-colors"
              title="Dismiss error"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Main Composer Box */}
      <div
        className={cn(
          "relative rounded-2xl bg-zinc-900/90 border transition-all duration-200 shadow-xl",
          error
            ? "border-red-500/40 ring-1 ring-red-500/20"
            : "border-white/[0.1] focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/30"
        )}
      >
        <div className="flex items-end gap-2 p-3 sm:p-3.5">
          {/* Link Icon Indicator */}
          <div className="pb-1.5 pl-1 text-zinc-400">
            <Link2 className="w-4 h-4" />
          </div>

          {/* Text Area */}
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => {
              onChange(e.target.value);
              if (error && onErrorClear) onErrorClear();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Paste a news article URL..."
            disabled={isProcessing}
            className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-400 resize-none focus:outline-none min-h-[24px] max-h-[120px] py-1 leading-relaxed disabled:opacity-50"
          />

          {/* Action Area: Clear & Send Button */}
          <div className="flex items-center gap-1.5 flex-shrink-0 pb-0.5">
            {input && (
              <button
                type="button"
                onClick={handleClear}
                className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                title="Clear input"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => onSubmit()}
              disabled={isSendDisabled}
              className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer",
                isSendDisabled
                  ? "bg-zinc-800 text-zinc-600 cursor-not-allowed opacity-50"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20 active:scale-95"
              )}
              title={isSendDisabled ? "Enter a valid article URL" : "Generate AI News Video"}
              aria-label="Send URL"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>

      {/* Minimal Footer Note */}
      <div className="mt-2 text-center">
        <span className="text-[11px] text-zinc-300 font-mono">
          Phase 1 Mock Engine • Accepts HTTP/HTTPS Sports &amp; News URLs
        </span>
      </div>
    </div>
  );
}
