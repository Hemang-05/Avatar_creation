"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Message, ProcessingStep } from "@/types/chat";
import { Article, ArticleExtractResponse, ExtractionMethod } from "@/types/article";
import { ResearchApiResponse, ResearchResult } from "@/types/research";
import { NewsScript, ScriptApiResponse } from "@/types/script";
import { TTSErrorResponse } from "@/types/tts";
import { AvatarApiResponse, AvatarMetadata } from "@/types/avatar";
import { AudioObjectUrlManager } from "@/lib/tts/ttsUtils";
import { validateArticleUrl } from "@/lib/urlValidation";
import { DEFAULT_PIPELINE_STEPS } from "@/lib/simulation";
import {
  base64ToBlob,
  blobToBase64,
  getCachedUrlPipeline,
  saveCachedUrlPipeline,
} from "@/lib/cache/pipelineCache";

export function useNewsStudioChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentInput, setCurrentInput] = useState<string>("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioUrlManagerRef = useRef<AudioObjectUrlManager | null>(null);

  useEffect(() => {
    if (!audioUrlManagerRef.current) {
      audioUrlManagerRef.current = new AudioObjectUrlManager();
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (stepTimerRef.current) {
        clearTimeout(stepTimerRef.current);
      }
      if (audioUrlManagerRef.current) {
        audioUrlManagerRef.current.revokeCurrent();
      }
    };
  }, []);

  /**
   * Submit a news article URL, checking browser localStorage cache first.
   * Any stage already cached for this URL is restored directly from localStorage
   * without triggering external APIs.
   */
  const submitUrl = useCallback(
    async (inputUrl?: string) => {
      const targetUrl = (inputUrl !== undefined ? inputUrl : currentInput).trim();
      const validation = validateArticleUrl(targetUrl);

      if (!validation.isValid) {
        setInputError(validation.error || "Please enter a valid URL");
        return false;
      }

      const canonicalUrl = validation.normalizedUrl || targetUrl;
      const cachedEntry = getCachedUrlPipeline(canonicalUrl);
      const isFullCacheHit = Boolean(
        cachedEntry?.article &&
          cachedEntry?.research &&
          cachedEntry?.script &&
          cachedEntry?.audio?.audioBase64 &&
          cachedEntry?.avatar?.videoUrl
      );

      setInputError(null);
      setCurrentInput("");
      setIsProcessing(true);

      const now = new Date().toISOString();
      const userMsgId = `user-${Date.now()}`;
      const assistantTextId = `assistant-text-${Date.now() + 1}`;
      const assistantStatusId = `assistant-status-${Date.now() + 2}`;

      const userMessage: Message = {
        id: userMsgId,
        role: "user",
        type: "text",
        content: canonicalUrl,
        metadata: {
          articleUrl: canonicalUrl,
          domain: validation.domain,
        },
        createdAt: now,
      };

      const assistantIntroMessage: Message = {
        id: assistantTextId,
        role: "assistant",
        type: "text",
        content: isFullCacheHit
          ? "Found this article in your local browser cache. Restoring the extracted article, verified research, presenter script, voice audio, and avatar video without calling external APIs."
          : "Got it. I've received the news article.\nI'll extract the story, verify key claims across web sources, write the broadcast script, synthesize the presenter voice, and generate the talking presenter video.",
        createdAt: new Date(Date.now() + 10).toISOString(),
      };

      const initialSteps: ProcessingStep[] = DEFAULT_PIPELINE_STEPS.map((step, idx) => ({
        ...step,
        status: idx === 0 ? "processing" : "pending",
      }));

      const assistantStatusMessage: Message = {
        id: assistantStatusId,
        role: "assistant",
        type: "status",
        content: isFullCacheHit
          ? "Restoring broadcast news package from local cache"
          : "Preparing broadcast news package",
        metadata: {
          articleUrl: canonicalUrl,
          domain: validation.domain,
          steps: initialSteps,
          currentStepIndex: 0,
          isProcessing: true,
        },
        createdAt: new Date(Date.now() + 20).toISOString(),
      };

      setMessages((prev) => [
        ...prev,
        userMessage,
        assistantIntroMessage,
        assistantStatusMessage,
      ]);

      // Cancel any ongoing fetch or step timer
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (stepTimerRef.current) {
        clearTimeout(stepTimerRef.current);
      }
      abortControllerRef.current = new AbortController();

      try {
        // ====================================================================
        // PHASE 2: EXTRACT ARTICLE (Check localStorage cache first)
        // ====================================================================
        let extractedArticle: Article;
        let extractionMethod: ExtractionMethod;
        let usedCachedArticle = false;

        if (cachedEntry?.article) {
          extractedArticle = cachedEntry.article;
          extractionMethod = cachedEntry.extractionMethod || "readability";
          usedCachedArticle = true;
        } else {
          const extractResponse = await fetch("/api/article/extract", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: canonicalUrl }),
            signal: abortControllerRef.current.signal,
          });

          const extractData: ArticleExtractResponse = await extractResponse.json();

          if (!extractResponse.ok || !extractData.success || !extractData.article) {
            const errObj = !extractData.success ? extractData.error : null;
            const friendlyError =
              errObj?.message || "Unable to extract an article from this URL.";

            setMessages((prev) => {
              const updated = prev.map((msg) => {
                if (msg.id !== assistantStatusId || !msg.metadata?.steps) return msg;

                const updatedSteps: ProcessingStep[] = msg.metadata.steps.map((s, idx) => {
                  if (idx === 0) {
                    return {
                      ...s,
                      label: "Extraction failed",
                      status: "error",
                      description: friendlyError,
                    };
                  }
                  return s;
                });

                return {
                  ...msg,
                  metadata: {
                    ...msg.metadata,
                    steps: updatedSteps,
                    isProcessing: false,
                    errorMessage: friendlyError,
                  },
                };
              });

              const errorMsg: Message = {
                id: `error-${Date.now()}`,
                role: "assistant",
                type: "text",
                content: friendlyError,
                createdAt: new Date().toISOString(),
              };

              return [...updated, errorMsg];
            });

            return true;
          }

          extractedArticle = extractData.article;
          extractionMethod = extractData.extractionMethod;

          saveCachedUrlPipeline(canonicalUrl, {
            domain: validation.domain,
            article: extractedArticle,
            extractionMethod,
          });
        }

        setMessages((prev) => {
          const updated = prev.map((msg) => {
            if (msg.id !== assistantStatusId || !msg.metadata?.steps) return msg;

            const updatedSteps: ProcessingStep[] = msg.metadata.steps.map((s, idx) => {
              if (idx === 0) {
                return {
                  ...s,
                  label: "Article extracted",
                  status: "completed",
                  description: usedCachedArticle
                    ? `Loaded ${extractedArticle.wordCount} words from local browser cache`
                    : `Extracted ${extractedArticle.wordCount} words via ${extractionMethod} engine`,
                };
              }
              if (idx === 1) {
                return {
                  ...s,
                  label: "Researching story...",
                  status: "processing",
                  description: cachedEntry?.research
                    ? "Loading verified research from local browser cache..."
                    : "Identifying factual claims and querying Tavily web search...",
                };
              }
              return { ...s, status: "pending" };
            });

            return {
              ...msg,
              metadata: {
                ...msg.metadata,
                steps: updatedSteps,
                currentStepIndex: 1,
                isProcessing: true,
              },
            };
          });

          const articleMessage: Message = {
            id: `article-${Date.now()}`,
            role: "assistant",
            type: "article",
            content: usedCachedArticle
              ? "Loaded extracted article from local cache."
              : "I've extracted the article successfully.",
            metadata: {
              articleUrl: canonicalUrl,
              article: extractedArticle,
              extractionMethod,
            },
            createdAt: new Date().toISOString(),
          };

          return [...updated, articleMessage];
        });

        // ====================================================================
        // PHASE 3: RESEARCH AGENT (Check localStorage cache first)
        // ====================================================================
        let researchResult: ResearchResult;
        let usedCachedResearch = false;

        if (cachedEntry?.research) {
          researchResult = cachedEntry.research;
          usedCachedResearch = true;
        } else {
          // Transition UI to "Verifying claims..." while research finishes
          stepTimerRef.current = setTimeout(() => {
            setMessages((prev) =>
              prev.map((msg) => {
                if (
                  msg.id !== assistantStatusId ||
                  !msg.metadata?.steps ||
                  !msg.metadata.isProcessing
                ) {
                  return msg;
                }

                const updatedSteps: ProcessingStep[] = msg.metadata.steps.map((s, idx) => {
                  if (idx === 0) return s;
                  if (idx === 1) {
                    return {
                      ...s,
                      label: "Researching story...",
                      status: "completed",
                      description: "Claims identified and web search queries dispatched",
                    };
                  }
                  if (idx === 2) {
                    return {
                      ...s,
                      label: "Verifying claims...",
                      status: "processing",
                      description: "Cross-checking evidence and detecting conflicts with Gemini...",
                    };
                  }
                  return s;
                });

                return {
                  ...msg,
                  metadata: {
                    ...msg.metadata,
                    steps: updatedSteps,
                    currentStepIndex: 2,
                  },
                };
              })
            );
          }, 1800);

          const researchResponse = await fetch("/api/article/research", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              article: {
                ...extractedArticle,
                extractionMethod,
              },
            }),
            signal: abortControllerRef.current.signal,
          });

          if (stepTimerRef.current) {
            clearTimeout(stepTimerRef.current);
          }

          const researchData: ResearchApiResponse = await researchResponse.json();

          if (!researchResponse.ok || !researchData.success || !researchData.research) {
            const errObj = !researchData.success ? researchData.error : null;
            const researchErrorMsg =
              errObj?.message || "Unable to complete web research for this article.";

            setMessages((prev) => {
              const updated = prev.map((msg) => {
                if (msg.id !== assistantStatusId || !msg.metadata?.steps) return msg;

                const updatedSteps: ProcessingStep[] = msg.metadata.steps.map((s, idx) => {
                  if (idx === 0) return s;
                  if (idx === 1 && s.status !== "completed") {
                    return {
                      ...s,
                      label: "Research failed",
                      status: "error",
                      description: researchErrorMsg,
                    };
                  }
                  if (idx === 2) {
                    return {
                      ...s,
                      label: "Verification halted",
                      status: "error",
                      description: researchErrorMsg,
                    };
                  }
                  return s;
                });

                return {
                  ...msg,
                  metadata: {
                    ...msg.metadata,
                    steps: updatedSteps,
                    isProcessing: false,
                    errorMessage: researchErrorMsg,
                  },
                };
              });

              const errorMsg: Message = {
                id: `research-error-${Date.now()}`,
                role: "assistant",
                type: "text",
                content: researchErrorMsg,
                createdAt: new Date().toISOString(),
              };

              return [...updated, errorMsg];
            });

            return true;
          }

          researchResult = researchData.research;
          saveCachedUrlPipeline(canonicalUrl, {
            research: researchResult,
          });
        }

        const verifiedCount = researchResult.claims.filter(
          (c) => c.status === "verified"
        ).length;

        setMessages((prev) => {
          const updated = prev.map((msg) => {
            if (msg.id !== assistantStatusId || !msg.metadata?.steps) return msg;

            const updatedSteps: ProcessingStep[] = msg.metadata.steps.map((s, idx) => {
              if (idx === 0) {
                return {
                  ...s,
                  label: "Article extracted",
                  status: "completed",
                };
              }
              if (idx === 1) {
                return {
                  ...s,
                  label: "Researching story...",
                  status: "completed",
                  description: usedCachedResearch
                    ? `Loaded ${researchResult.sources.length} web sources from local browser cache`
                    : `Searched ${researchResult.sources.length} web sources across ${researchResult.researchIterations} iteration(s)`,
                };
              }
              if (idx === 2) {
                return {
                  ...s,
                  label: "Research complete",
                  status: "completed",
                  description: usedCachedResearch
                    ? `Loaded ${verifiedCount}/${researchResult.claims.length} verified claims from local cache`
                    : `Verified ${verifiedCount}/${researchResult.claims.length} claims (${Math.round(
                        researchResult.overallConfidence * 100
                      )}% confidence)`,
                };
              }
              if (idx === 3) {
                return {
                  ...s,
                  label: "Generating presenter script...",
                  status: "processing",
                  description: cachedEntry?.script
                    ? "Loading broadcast script from local browser cache..."
                    : "Synthesizing verified claims into a broadcast-ready script...",
                };
              }
              return s;
            });

            return {
              ...msg,
              metadata: {
                ...msg.metadata,
                steps: updatedSteps,
                currentStepIndex: 3,
                isProcessing: true,
              },
            };
          });

          const researchMessage: Message = {
            id: `research-${Date.now()}`,
            role: "assistant",
            type: "research",
            content: usedCachedResearch
              ? "Loaded verified research package from local cache."
              : "Research complete. Here is the verified research package.",
            metadata: {
              articleUrl: extractedArticle.url,
              title: extractedArticle.title,
              research: researchResult,
            },
            createdAt: new Date().toISOString(),
          };

          return [...updated, researchMessage];
        });

        // ====================================================================
        // PHASE 4: PRESENTER SCRIPT GENERATION (Check localStorage cache first)
        // ====================================================================
        let newsScript: NewsScript;
        let usedCachedScript = false;

        if (cachedEntry?.script) {
          newsScript = cachedEntry.script;
          usedCachedScript = true;
        } else {
          const scriptResponse = await fetch("/api/article/script", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ research: researchResult }),
            signal: abortControllerRef.current.signal,
          });

          const scriptData: ScriptApiResponse = await scriptResponse.json();

          if (!scriptResponse.ok || !scriptData.success || !scriptData.script) {
            const scriptErr = !scriptData.success ? scriptData.error : null;
            const scriptErrorMsg =
              scriptErr?.message || "Unable to generate news script for this story.";

            setMessages((prev) => {
              const updated = prev.map((msg) => {
                if (msg.id !== assistantStatusId || !msg.metadata?.steps) return msg;

                const updatedSteps: ProcessingStep[] = msg.metadata.steps.map((s, idx) => {
                  if (idx === 3) {
                    return {
                      ...s,
                      label: "Script generation failed",
                      status: "error",
                      description: scriptErrorMsg,
                    };
                  }
                  return s;
                });

                return {
                  ...msg,
                  metadata: {
                    ...msg.metadata,
                    steps: updatedSteps,
                    isProcessing: false,
                    errorMessage: scriptErrorMsg,
                  },
                };
              });

              const errorMsg: Message = {
                id: `script-error-${Date.now()}`,
                role: "assistant",
                type: "text",
                content: scriptErrorMsg,
                createdAt: new Date().toISOString(),
              };

              return [...updated, errorMsg];
            });

            return true;
          }

          newsScript = scriptData.script;
          saveCachedUrlPipeline(canonicalUrl, {
            script: newsScript,
          });
        }

        setMessages((prev) => {
          const updated = prev.map((msg) => {
            if (msg.id !== assistantStatusId || !msg.metadata?.steps) return msg;

            const updatedSteps: ProcessingStep[] = msg.metadata.steps.map((s, idx) => {
              if (idx === 3) {
                return {
                  ...s,
                  label: "Script generated",
                  status: "completed",
                  description: usedCachedScript
                    ? `Loaded ${newsScript.wordCount} words (~${newsScript.estimatedDurationSeconds}s) from local browser cache`
                    : `Generated ${newsScript.wordCount} words (~${newsScript.estimatedDurationSeconds}s airtime, ${newsScript.tone} tone)`,
                };
              }
              if (idx === 4) {
                return {
                  ...s,
                  label: "Generating voice...",
                  status: "processing",
                  description: cachedEntry?.audio?.audioBase64
                    ? "Loading ElevenLabs presenter audio from local browser cache..."
                    : "Synthesizing presenter voice audio via ElevenLabs TTS...",
                };
              }
              return s;
            });

            return {
              ...msg,
              metadata: {
                ...msg.metadata,
                steps: updatedSteps,
                currentStepIndex: 4,
                isProcessing: true,
              },
            };
          });

          const scriptMessage: Message = {
            id: `script-${Date.now()}`,
            role: "assistant",
            type: "script",
            content: usedCachedScript
              ? "Loaded presenter script from local cache."
              : "Presenter script generated successfully.",
            metadata: {
              articleUrl: extractedArticle.url,
              title: newsScript.title,
              script: newsScript,
            },
            createdAt: new Date().toISOString(),
          };

          return [...updated, scriptMessage];
        });

        // ====================================================================
        // PHASE 5: TEXT-TO-SPEECH (TTS) VOICE GENERATION (Check cache first)
        // ====================================================================
        let activeAudioUrl: string;
        let activeAudioBase64: string | undefined;
        let activeMimeType = "audio/mpeg";
        let activeAudioId: string | undefined;
        let activeServerAudioUrl: string | undefined;
        let activeProviderHeader = "elevenlabs";
        let activeModelHeader = "eleven_v4";
        let usedCachedAudio = false;

        if (cachedEntry?.audio?.audioBase64) {
          activeAudioBase64 = cachedEntry.audio.audioBase64;
          activeMimeType = cachedEntry.audio.mimeType || "audio/mpeg";
          activeAudioId = cachedEntry.audio.audioId;
          activeServerAudioUrl = cachedEntry.audio.serverAudioUrl;
          activeProviderHeader = cachedEntry.audio.provider || "elevenlabs";
          activeModelHeader = cachedEntry.audio.modelId || "eleven_v4";

          const restoredBlob = base64ToBlob(activeAudioBase64, activeMimeType);
          if (!audioUrlManagerRef.current) {
            audioUrlManagerRef.current = new AudioObjectUrlManager();
          }
          activeAudioUrl = audioUrlManagerRef.current.createAndReplace(restoredBlob);
          usedCachedAudio = true;
        } else {
          const ttsResponse = await fetch("/api/article/tts", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ script: newsScript }),
            signal: abortControllerRef.current.signal,
          });

          if (!ttsResponse.ok) {
            const ttsErrPayload = (await ttsResponse.json().catch(() => null)) as
              | TTSErrorResponse
              | null;
            const ttsErrorMsg =
              ttsErrPayload?.error?.message ||
              "Unable to synthesize presenter voice audio.";

            setMessages((prev) => {
              const updated = prev.map((msg) => {
                if (msg.id !== assistantStatusId || !msg.metadata?.steps) return msg;

                const updatedSteps: ProcessingStep[] = msg.metadata.steps.map((s, idx) => {
                  if (idx === 4) {
                    return {
                      ...s,
                      label: "Voice generation failed",
                      status: "error",
                      description: ttsErrorMsg,
                    };
                  }
                  return s;
                });

                return {
                  ...msg,
                  metadata: {
                    ...msg.metadata,
                    steps: updatedSteps,
                    isProcessing: false,
                    errorMessage: ttsErrorMsg,
                  },
                };
              });

              const errorMsg: Message = {
                id: `tts-error-${Date.now()}`,
                role: "assistant",
                type: "text",
                content: ttsErrorMsg,
                createdAt: new Date().toISOString(),
              };

              return [...updated, errorMsg];
            });

            return true;
          }

          const audioBlob = await ttsResponse.blob();
          activeMimeType = audioBlob.type || "audio/mpeg";
          activeAudioBase64 = await blobToBase64(audioBlob);

          if (!audioUrlManagerRef.current) {
            audioUrlManagerRef.current = new AudioObjectUrlManager();
          }
          activeAudioUrl = audioUrlManagerRef.current.createAndReplace(audioBlob);

          activeProviderHeader = ttsResponse.headers.get("X-TTS-Provider") || "elevenlabs";
          activeModelHeader = ttsResponse.headers.get("X-TTS-Model") || "eleven_v4";
          activeAudioId = ttsResponse.headers.get("X-TTS-Audio-Id") || undefined;
          activeServerAudioUrl = ttsResponse.headers.get("X-TTS-Audio-Url") || undefined;

          saveCachedUrlPipeline(canonicalUrl, {
            audio: {
              audioBase64: activeAudioBase64,
              mimeType: activeMimeType,
              audioId: activeAudioId,
              serverAudioUrl: activeServerAudioUrl,
              provider: activeProviderHeader,
              modelId: activeModelHeader,
              scriptTitle: newsScript.title,
              wordCount: newsScript.wordCount,
              estimatedDurationSeconds: newsScript.estimatedDurationSeconds,
              generatedAt: new Date().toISOString(),
            },
          });
        }

        setMessages((prev) => {
          const updated = prev.map((msg) => {
            if (msg.id !== assistantStatusId || !msg.metadata?.steps) return msg;

            const updatedSteps: ProcessingStep[] = msg.metadata.steps.map((s, idx) => {
              if (idx === 4) {
                return {
                  ...s,
                  label: "Voice generated",
                  status: "completed",
                  description: usedCachedAudio
                    ? `Loaded MP3 audio (${newsScript.wordCount} words) from local browser cache`
                    : `Synthesized MP3 audio via ${activeProviderHeader} (${newsScript.wordCount} words)`,
                };
              }
              if (idx === 5) {
                return {
                  ...s,
                  label: "Generating presenter...",
                  status: "processing",
                  description: cachedEntry?.avatar?.videoUrl
                    ? "Loading talking presenter video from local browser cache..."
                    : "Animating presenter portrait with lip-sync via D-ID...",
                };
              }
              return s;
            });

            return {
              ...msg,
              metadata: {
                ...msg.metadata,
                steps: updatedSteps,
                currentStepIndex: 5,
                isProcessing: true,
              },
            };
          });

          const audioMessage: Message = {
            id: `audio-${Date.now()}`,
            role: "assistant",
            type: "audio",
            content: usedCachedAudio
              ? "Loaded presenter voice audio from local cache."
              : "Voice generation complete. You can listen to the presenter audio below.",
            metadata: {
              articleUrl: extractedArticle.url,
              title: newsScript.title,
              audio: {
                audioUrl: activeAudioUrl,
                mimeType: activeMimeType,
                audioId: activeAudioId,
                serverAudioUrl: activeServerAudioUrl,
                provider: activeProviderHeader,
                modelId: activeModelHeader,
                scriptTitle: newsScript.title,
                wordCount: newsScript.wordCount,
                estimatedDurationSeconds: newsScript.estimatedDurationSeconds,
                generatedAt: new Date().toISOString(),
              },
            },
            createdAt: new Date().toISOString(),
          };

          return [...updated, audioMessage];
        });

        // ====================================================================
        // PHASE 6: AI PRESENTER AVATAR + LIP SYNC (Final Phase for MVP)
        // ====================================================================
        if (cachedEntry?.avatar?.videoUrl) {
          const cachedAvatar: AvatarMetadata = cachedEntry.avatar;

          setMessages((prev) => {
            const updated = prev.map((msg) => {
              if (msg.id !== assistantStatusId || !msg.metadata?.steps) return msg;

              const updatedSteps: ProcessingStep[] = msg.metadata.steps.map((s, idx) => {
                if (idx === 5) {
                  return {
                    ...s,
                    label: "Avatar video ready",
                    status: "completed",
                    description: "Loaded talking presenter video from local browser cache",
                  };
                }
                return s;
              });

              return {
                ...msg,
                metadata: {
                  ...msg.metadata,
                  steps: updatedSteps,
                  currentStepIndex: 5,
                  isProcessing: false,
                },
              };
            });

            const avatarMessage: Message = {
              id: `avatar-${Date.now()}`,
              role: "assistant",
              type: "avatar",
              content: "Loaded AI presenter video from local cache.",
              metadata: {
                articleUrl: extractedArticle.url,
                title: newsScript.title,
                avatar: cachedAvatar,
              },
              createdAt: new Date().toISOString(),
            };

            return [...updated, avatarMessage];
          });

          return true;
        }

        const avatarResponse = await fetch("/api/article/avatar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            script: newsScript,
            audioId: activeAudioId,
            audioUrl: activeServerAudioUrl,
            audioBase64: activeAudioBase64,
            mimeType: activeMimeType,
          }),
          signal: abortControllerRef.current.signal,
        });

        const avatarData = (await avatarResponse.json().catch(() => null)) as
          | AvatarApiResponse
          | null;

        if (avatarResponse.ok && avatarData && avatarData.success) {
          const avatarMetadata: AvatarMetadata = {
            videoUrl: avatarData.videoUrl,
            provider: avatarData.provider,
            providerVideoId: avatarData.providerVideoId,
            status: avatarData.status,
            durationSeconds:
              avatarData.durationSeconds ?? newsScript.estimatedDurationSeconds,
            presenterName: avatarData.presenterName || "Hemang",
            scriptTitle: newsScript.title,
            generatedAt: avatarData.generatedAt || new Date().toISOString(),
          };

          saveCachedUrlPipeline(canonicalUrl, {
            avatar: avatarMetadata,
          });

          setMessages((prev) => {
            const updated = prev.map((msg) => {
              if (msg.id !== assistantStatusId || !msg.metadata?.steps) return msg;

              const updatedSteps: ProcessingStep[] = msg.metadata.steps.map((s, idx) => {
                if (idx === 5) {
                  return {
                    ...s,
                    label: "Avatar video ready",
                    status: "completed",
                    description: `Generated talking presenter video via ${avatarData.provider.toUpperCase()}`,
                  };
                }
                return s;
              });

              return {
                ...msg,
                metadata: {
                  ...msg.metadata,
                  steps: updatedSteps,
                  currentStepIndex: 5,
                  isProcessing: false,
                },
              };
            });

            const avatarMessage: Message = {
              id: `avatar-${Date.now()}`,
              role: "assistant",
              type: "avatar",
              content: "Avatar video ready. Watch the AI presenter broadcast below.",
              metadata: {
                articleUrl: extractedArticle.url,
                title: newsScript.title,
                avatar: avatarMetadata,
              },
              createdAt: new Date().toISOString(),
            };

            return [...updated, avatarMessage];
          });
        } else {
          const avatarErrMsg =
            (avatarData && !avatarData.success && avatarData.error?.message) ||
            "Unable to generate presenter avatar video.";

          setMessages((prev) => {
            const updated = prev.map((msg) => {
              if (msg.id !== assistantStatusId || !msg.metadata?.steps) return msg;

              const updatedSteps: ProcessingStep[] = msg.metadata.steps.map((s, idx) => {
                if (idx === 5) {
                  return {
                    ...s,
                    label: "Presenter generation failed",
                    status: "error",
                    description: avatarErrMsg,
                  };
                }
                return s;
              });

              return {
                ...msg,
                metadata: {
                  ...msg.metadata,
                  steps: updatedSteps,
                  isProcessing: false,
                  errorMessage: avatarErrMsg,
                },
              };
            });

            const errorMsg: Message = {
              id: `avatar-error-${Date.now()}`,
              role: "assistant",
              type: "text",
              content: avatarErrMsg,
              createdAt: new Date().toISOString(),
            };

            return [...updated, errorMsg];
          });
        }
      } catch (err: unknown) {
        if (stepTimerRef.current) {
          clearTimeout(stepTimerRef.current);
        }
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        const fallbackMsg =
          "I encountered an issue processing this article. Please check your connection or API configuration and try again.";
        setMessages((prev) => {
          const updated = prev.map((msg) => {
            if (msg.id !== assistantStatusId || !msg.metadata?.steps) return msg;
            const updatedSteps: ProcessingStep[] = msg.metadata.steps.map((s) => {
              if (s.status === "processing") {
                return {
                  ...s,
                  status: "error",
                  description: fallbackMsg,
                };
              }
              return s;
            });
            return {
              ...msg,
              metadata: {
                ...msg.metadata,
                steps: updatedSteps,
                isProcessing: false,
              },
            };
          });

          const errorMsg: Message = {
            id: `error-${Date.now()}`,
            role: "assistant",
            type: "text",
            content: fallbackMsg,
            createdAt: new Date().toISOString(),
          };

          return [...updated, errorMsg];
        });
      } finally {
        setIsProcessing(false);
      }

      return true;
    },
    [currentInput]
  );

  /**
   * Select a suggestion card to populate composer
   */
  const selectSuggestion = useCallback((url: string) => {
    setCurrentInput(url);
    setInputError(null);
  }, []);

  /**
   * Reset the chat back to empty state and revoke any active audio Object URL
   */
  const resetChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (stepTimerRef.current) {
      clearTimeout(stepTimerRef.current);
    }
    if (audioUrlManagerRef.current) {
      audioUrlManagerRef.current.revokeCurrent();
    }
    setIsProcessing(false);
    setMessages([]);
    setCurrentInput("");
    setInputError(null);
  }, []);

  /**
   * Retry/re-extract article
   */
  const retryExtraction = useCallback(
    (articleUrl: string) => {
      if (isProcessing) return;
      submitUrl(articleUrl);
    },
    [isProcessing, submitUrl]
  );

  return {
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
  };
}
