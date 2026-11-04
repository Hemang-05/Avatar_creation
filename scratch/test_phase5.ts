import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { NewsScript } from "../src/types/script";
import {
  DEFAULT_ELEVENLABS_MODEL_ID,
  DEFAULT_ELEVENLABS_VOICE_ID,
  MAX_TTS_SCRIPT_WORDS,
  TTSServiceError,
} from "../src/lib/tts/ttsTypes";
import { ElevenLabsClientLike, ElevenLabsProvider } from "../src/lib/tts/elevenLabsProvider";
import { resolveTTSProvider } from "../src/lib/tts/ttsProvider";
import { synthesizeScript } from "../src/lib/tts/ttsService";
import { AudioObjectUrlManager } from "../src/lib/tts/ttsUtils";
import { AudioResultCard } from "../src/components/chat/AudioResultCard";
import { ChatMessage } from "../src/components/chat/ChatMessage";
import { Message } from "../src/types/chat";
import { POST as ttsPostRoute } from "../src/app/api/article/tts/route";

const SAMPLE_SCRIPT: NewsScript = {
  title: "India Dominates Bangladesh in Asian Champions Trophy Opener",
  hook: "Defending champions India opened their Asian Champions Trophy campaign with a commanding 13-0 win over Bangladesh.",
  segments: [
    {
      id: "seg_1",
      type: "hook",
      text: "Defending champions India opened their Asian Champions Trophy campaign with a commanding 13-0 win over Bangladesh.",
      estimatedDurationSeconds: 7,
      claimIds: ["claim_1"],
    },
    {
      id: "seg_2",
      type: "story",
      text: "Captain Harmanpreet Singh scored twice from penalty corners as India controlled possession throughout all four quarters.",
      estimatedDurationSeconds: 8,
      claimIds: ["claim_2"],
    },
  ],
  fullScript:
    "Defending champions India opened their Asian Champions Trophy campaign with a commanding 13-0 win over Bangladesh. Captain Harmanpreet Singh scored twice from penalty corners as India controlled possession throughout all four quarters.",
  wordCount: 33,
  estimatedDurationSeconds: 15,
  tone: "professional",
  usedClaimIds: ["claim_1", "claim_2"],
  excludedClaimIds: [],
  generatedAt: "2026-10-29T00:00:00.000Z",
};

/**
 * Helper to create a Web ReadableStream from a Buffer to simulate ElevenLabs SDK output
 */
function createMockAudioStream(bytes: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
}

async function runPhase5Tests() {
  console.log("=======================================================");
  console.log("RUNNING PHASE 5 TTS UNIT & INTEGRATION TESTS (17 CASES)");
  console.log("=======================================================\n");

  // ---------------------------------------------------------------------------
  // Tests 1, 13, 14: Valid TTS request + Correct voiceId & modelId passed
  // ---------------------------------------------------------------------------
  console.log("[Tests 1, 13, 14] Testing valid TTS synthesis and parameter forwarding...");
  let capturedVoiceId = "";
  let capturedModelId = "";
  let capturedOutputFormat = "";
  let capturedText = "";

  const mockMp3Header = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0x00, 0x01, 0x02, 0x03]);
  const mockClientSuccess: ElevenLabsClientLike = {
    textToSpeech: {
      convert: async (voiceId, req) => {
        capturedVoiceId = voiceId;
        capturedModelId = req.modelId ?? "";
        capturedOutputFormat = req.outputFormat ?? "";
        capturedText = req.text;
        return createMockAudioStream(mockMp3Header);
      },
    },
  };

  const result1 = await synthesizeScript(SAMPLE_SCRIPT, {
    apiKey: "test-elevenlabs-key",
    voiceId: DEFAULT_ELEVENLABS_VOICE_ID,
    modelId: DEFAULT_ELEVENLABS_MODEL_ID,
    client: mockClientSuccess,
  });

  assert.ok(Buffer.isBuffer(result1.audio), "Test 1: Audio must be a Node.js Buffer");
  assert.equal(result1.audio.length, mockMp3Header.length);
  assert.equal(result1.mimeType, "audio/mpeg");
  assert.equal(result1.provider, "elevenlabs");
  assert.equal(
    capturedVoiceId,
    DEFAULT_ELEVENLABS_VOICE_ID,
    "Test 13: Correct voiceId must be passed to ElevenLabs"
  );
  assert.equal(
    capturedModelId,
    DEFAULT_ELEVENLABS_MODEL_ID,
    "Test 14: Correct modelId must be passed to ElevenLabs"
  );
  assert.equal(capturedOutputFormat, "mp3_44100_128");
  assert.equal(capturedText, SAMPLE_SCRIPT.fullScript);
  console.log("✓ Tests 1, 13, 14 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 2: Missing API key
  // ---------------------------------------------------------------------------
  console.log("[Test 2] Testing missing ELEVENLABS_API_KEY...");
  const savedApiKey = process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;

  await assert.rejects(
    async () => {
      await synthesizeScript(SAMPLE_SCRIPT, {
        apiKey: "",
        client: mockClientSuccess,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof TTSServiceError);
      assert.equal(err.code, "MISSING_API_KEY");
      assert.equal(err.statusCode, 500);
      assert.ok(err.message.includes("TTS provider is not configured"));
      return true;
    }
  );
  if (savedApiKey !== undefined) process.env.ELEVENLABS_API_KEY = savedApiKey;
  console.log("✓ Test 2 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 3: Missing voice ID
  // ---------------------------------------------------------------------------
  console.log("[Test 3] Testing missing voice ID...");
  await assert.rejects(
    async () => {
      await synthesizeScript(SAMPLE_SCRIPT, {
        apiKey: "test-elevenlabs-key",
        voiceId: "   ",
        client: mockClientSuccess,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof TTSServiceError);
      assert.equal(err.code, "MISSING_VOICE_ID");
      assert.equal(err.statusCode, 500);
      return true;
    }
  );
  console.log("✓ Test 3 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 4: Missing model ID
  // ---------------------------------------------------------------------------
  console.log("[Test 4] Testing missing model ID...");
  await assert.rejects(
    async () => {
      await synthesizeScript(SAMPLE_SCRIPT, {
        apiKey: "test-elevenlabs-key",
        modelId: "",
        client: mockClientSuccess,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof TTSServiceError);
      assert.equal(err.code, "MISSING_MODEL_ID");
      assert.equal(err.statusCode, 500);
      return true;
    }
  );
  console.log("✓ Test 4 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 5: Empty script
  // ---------------------------------------------------------------------------
  console.log("[Test 5] Testing empty script rejection (400)...");
  await assert.rejects(
    async () => {
      await synthesizeScript(
        { ...SAMPLE_SCRIPT, fullScript: "    " },
        { apiKey: "test-elevenlabs-key", client: mockClientSuccess }
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof TTSServiceError);
      assert.equal(err.code, "EMPTY_SCRIPT");
      assert.equal(err.statusCode, 400);
      assert.equal(err.message, "Script cannot be empty");
      return true;
    }
  );
  console.log("✓ Test 5 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 6: Invalid script structure
  // ---------------------------------------------------------------------------
  console.log("[Test 6] Testing invalid script structure rejection (400)...");
  await assert.rejects(
    async () => {
      await synthesizeScript(null, {
        apiKey: "test-elevenlabs-key",
        client: mockClientSuccess,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof TTSServiceError);
      assert.equal(err.code, "INVALID_SCRIPT");
      assert.equal(err.statusCode, 400);
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await synthesizeScript(
        { title: "Missing fullScript field" },
        { apiKey: "test-elevenlabs-key", client: mockClientSuccess }
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof TTSServiceError);
      assert.equal(err.code, "INVALID_SCRIPT");
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
  console.log("✓ Test 6 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 7: Script exceeding maximum length
  // ---------------------------------------------------------------------------
  console.log("[Test 7] Testing script exceeding maximum length (no silent truncation)...");
  const oversizedText = Array.from({ length: MAX_TTS_SCRIPT_WORDS + 25 }, () => "word").join(" ");
  await assert.rejects(
    async () => {
      await synthesizeScript(
        { ...SAMPLE_SCRIPT, fullScript: oversizedText },
        { apiKey: "test-elevenlabs-key", client: mockClientSuccess }
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof TTSServiceError);
      assert.equal(err.code, "SCRIPT_TOO_LONG");
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
  console.log("✓ Test 7 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 8: ElevenLabs authentication error (401/403 sanitized)
  // ---------------------------------------------------------------------------
  console.log("[Test 8] Testing ElevenLabs authentication error sanitization...");
  const mockClientAuthErr: ElevenLabsClientLike = {
    textToSpeech: {
      convert: async () => {
        const err = new Error("Raw secret key sk_secret_123456 rejected by upstream");
        (err as Error & { statusCode?: number }).statusCode = 401;
        throw err;
      },
    },
  };

  await assert.rejects(
    async () => {
      await synthesizeScript(SAMPLE_SCRIPT, {
        apiKey: "sk_secret_123456",
        client: mockClientAuthErr,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof TTSServiceError);
      assert.equal(err.code, "TTS_AUTH_ERROR");
      assert.equal(err.statusCode, 502);
      assert.ok(!err.message.includes("sk_secret_123456"), "Must never leak API key in error");
      return true;
    }
  );
  console.log("✓ Test 8 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 9: ElevenLabs rate-limit error (429)
  // ---------------------------------------------------------------------------
  console.log("[Test 9] Testing ElevenLabs rate-limit error (429)...");
  const mockClientRateLimit: ElevenLabsClientLike = {
    textToSpeech: {
      convert: async () => {
        const err = new Error("Too many requests");
        (err as Error & { statusCode?: number }).statusCode = 429;
        throw err;
      },
    },
  };

  await assert.rejects(
    async () => {
      await synthesizeScript(SAMPLE_SCRIPT, {
        apiKey: "test-elevenlabs-key",
        client: mockClientRateLimit,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof TTSServiceError);
      assert.equal(err.code, "TTS_RATE_LIMIT");
      assert.equal(err.statusCode, 429);
      return true;
    }
  );
  console.log("✓ Test 9 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 10: ElevenLabs upstream failure (502)
  // ---------------------------------------------------------------------------
  console.log("[Test 10] Testing ElevenLabs upstream service failure (502)...");
  const mockClientUpstreamErr: ElevenLabsClientLike = {
    textToSpeech: {
      convert: async () => {
        const err = new Error("Internal ElevenLabs cluster error");
        (err as Error & { statusCode?: number }).statusCode = 500;
        throw err;
      },
    },
  };

  await assert.rejects(
    async () => {
      await synthesizeScript(SAMPLE_SCRIPT, {
        apiKey: "test-elevenlabs-key",
        client: mockClientUpstreamErr,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof TTSServiceError);
      assert.equal(err.code, "TTS_PROVIDER_ERROR");
      assert.equal(err.statusCode, 502);
      return true;
    }
  );
  console.log("✓ Test 10 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 11: Timeout (504)
  // ---------------------------------------------------------------------------
  console.log("[Test 11] Testing TTS timeout handling (504)...");
  const mockClientTimeout: ElevenLabsClientLike = {
    textToSpeech: {
      convert: async (_voiceId, _req, reqOptions) => {
        return new Promise((_resolve, reject) => {
          if (reqOptions?.abortSignal) {
            reqOptions.abortSignal.addEventListener("abort", () => {
              const abortErr = new Error("The operation was aborted");
              abortErr.name = "AbortError";
              reject(abortErr);
            });
          }
        });
      },
    },
  };

  await assert.rejects(
    async () => {
      await synthesizeScript(SAMPLE_SCRIPT, {
        apiKey: "test-elevenlabs-key",
        timeoutMs: 50,
        client: mockClientTimeout,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof TTSServiceError);
      assert.equal(err.code, "TTS_TIMEOUT");
      assert.equal(err.statusCode, 504);
      return true;
    }
  );
  console.log("✓ Test 11 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 12: Provider selection (elevenlabs supported, unknown rejected)
  // ---------------------------------------------------------------------------
  console.log("[Test 12] Testing TTS provider selection and unsupported provider rejection...");
  const resolvedProvider = resolveTTSProvider({
    providerName: "elevenlabs",
    apiKey: "test-key",
  });
  assert.ok(resolvedProvider instanceof ElevenLabsProvider);

  assert.throws(
    () => {
      resolveTTSProvider({ providerName: "kokoro" });
    },
    (err: unknown) => {
      assert.ok(err instanceof TTSServiceError);
      assert.equal(err.code, "UNSUPPORTED_PROVIDER");
      assert.equal(err.statusCode, 500);
      return true;
    }
  );
  console.log("✓ Test 12 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 15: MP3 response & Content-Type header via API route validation
  // ---------------------------------------------------------------------------
  console.log("[Test 15] Testing MP3 MIME type and API Route error/response contract...");
  assert.equal(result1.mimeType, "audio/mpeg", "TTSResult mimeType must be audio/mpeg");

  // Test invalid POST body on /api/article/tts
  const invalidReq = new NextRequest("http://localhost:3000/api/article/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script: { fullScript: "" } }),
  });
  const invalidRouteRes = await ttsPostRoute(invalidReq);
  assert.equal(invalidRouteRes.status, 400);
  const invalidRouteJson = await invalidRouteRes.json();
  assert.equal(invalidRouteJson.error.code, "EMPTY_SCRIPT");
  console.log("✓ Test 15 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 16: Frontend audio rendering (AudioResultCard & ChatMessage)
  // ---------------------------------------------------------------------------
  console.log("[Test 16] Testing Frontend AudioResultCard & ChatMessage SSR rendering...");
  const sampleAudioMeta = {
    audioUrl: "blob:http://localhost:3000/mock-audio-uuid-123",
    mimeType: "audio/mpeg",
    provider: "elevenlabs",
    modelId: "eleven_v4",
    scriptTitle: SAMPLE_SCRIPT.title,
    wordCount: SAMPLE_SCRIPT.wordCount,
    estimatedDurationSeconds: SAMPLE_SCRIPT.estimatedDurationSeconds,
  };

  const audioCardHtml = renderToStaticMarkup(
    React.createElement(AudioResultCard, { audio: sampleAudioMeta })
  );

  assert.ok(audioCardHtml.includes("Presenter Voice Generated"), "Must show audio card title");
  assert.ok(audioCardHtml.includes(SAMPLE_SCRIPT.title), "Must show script title");
  assert.ok(audioCardHtml.includes("<audio"), "Must render native HTML <audio> element");
  assert.ok(
    audioCardHtml.includes('src="blob:http://localhost:3000/mock-audio-uuid-123"'),
    "Must bind blob URL to <audio src>"
  );

  const chatMsg: Message = {
    id: "audio-msg-1",
    role: "assistant",
    type: "audio",
    content: "Voice generation complete.",
    metadata: {
      audio: sampleAudioMeta,
    },
    createdAt: new Date().toISOString(),
  };

  const chatMsgHtml = renderToStaticMarkup(
    React.createElement(ChatMessage, { message: chatMsg })
  );
  assert.ok(
    chatMsgHtml.includes("Presenter Voice Generated") && chatMsgHtml.includes("<audio"),
    "ChatMessage must render AudioResultCard for type='audio'"
  );
  console.log("✓ Test 16 Passed\n");

  // ---------------------------------------------------------------------------
  // Test 17: Object URL cleanup (preventing memory leaks)
  // ---------------------------------------------------------------------------
  console.log("[Test 17] Testing Object URL creation, replacement revocation, and unmount cleanup...");
  const createdUrls: string[] = [];
  const revokedUrls: string[] = [];
  let urlCounter = 0;

  const manager = new AudioObjectUrlManager(
    () => {
      urlCounter++;
      const u = `blob:mock-url-${urlCounter}`;
      createdUrls.push(u);
      return u;
    },
    (u) => {
      revokedUrls.push(u);
    }
  );

  const blob1 = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" });
  const blob2 = new Blob([new Uint8Array([4, 5, 6])], { type: "audio/mpeg" });

  const url1 = manager.createAndReplace(blob1);
  assert.equal(url1, "blob:mock-url-1");
  assert.equal(revokedUrls.length, 0, "First URL creation should not revoke anything yet");

  const url2 = manager.createAndReplace(blob2);
  assert.equal(url2, "blob:mock-url-2");
  assert.deepEqual(
    revokedUrls,
    ["blob:mock-url-1"],
    "Creating second URL must immediately revoke first URL"
  );

  manager.revokeCurrent();
  assert.deepEqual(
    revokedUrls,
    ["blob:mock-url-1", "blob:mock-url-2"],
    "Unmounting/resetting must revoke the active URL"
  );
  assert.equal(manager.getActiveUrl(), null);
  console.log("✓ Test 17 Passed\n");

  console.log("=======================================================");
  console.log("ALL 17 PHASE 5 TTS TESTS PASSED SUCCESSFULLY!");
  console.log("=======================================================");
}

runPhase5Tests().catch((err) => {
  console.error("Phase 5 test suite failed:", err);
  process.exit(1);
});

