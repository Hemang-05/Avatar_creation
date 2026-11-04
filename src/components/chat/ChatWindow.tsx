"use client";

import React, { useRef, useEffect } from "react";
import { Message } from "@/types/chat";
import { ChatMessage } from "./ChatMessage";
import { EmptyState } from "./EmptyState";

interface ChatWindowProps {
  messages: Message[];
  onSelectSuggestion: (url: string) => void;
  onRegenerate?: (articleUrl: string) => void;
}

export function ChatWindow({
  messages,
  onSelectSuggestion,
  onRegenerate,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Smoothly scroll down when messages change or step updates occur
  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  if (messages.length === 0) {
    return <EmptyState onSelectSuggestion={onSelectSuggestion} />;
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 sm:py-8 space-y-6 max-w-3xl w-full mx-auto">
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          onRegenerate={onRegenerate}
        />
      ))}
      <div ref={bottomRef} className="h-4" />
    </div>
  );
}
