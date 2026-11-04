"use client";

import React from "react";
import { Header } from "@/components/layout/Header";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { useNewsStudioChat } from "@/hooks/useNewsStudioChat";

export default function Home() {
  const {
    messages,
    currentInput,
    setCurrentInput,
    inputError,
    setInputError,
    isProcessing,
    submitUrl,
    selectSuggestion,
    resetChat,
    retryExtraction,
  } = useNewsStudioChat();

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#090A0F] text-zinc-100 font-sans selection:bg-blue-600/30 selection:text-blue-200">
      {/* Studio Header */}
      <Header
        hasMessages={messages.length > 0}
        onReset={resetChat}
        isProcessing={isProcessing}
      />

      {/* Main Conversation Stream */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <ChatWindow
          messages={messages}
          onSelectSuggestion={selectSuggestion}
          onRegenerate={retryExtraction}
        />

        {/* Studio Composer Fixed at Bottom */}
        <ChatComposer
          input={currentInput}
          onChange={setCurrentInput}
          onSubmit={submitUrl}
          error={inputError}
          onErrorClear={() => setInputError(null)}
          isProcessing={isProcessing}
        />
      </main>
    </div>
  );
}
