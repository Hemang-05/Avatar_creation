import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import {
  AvatarServiceError,
} from "../src/lib/avatar/avatarTypes";
import {
  buildTemporaryAudioUrl,
  clearTemporaryAudioStore,
  getTemporaryAudio,
  registerTemporaryAudio,
  validateAudioMimeType,
  validatePublicAudioUrl,
} from "../src/lib/avatar/avatarUtils";
import { DidProvider, FetchLike } from "../src/lib/avatar/didProvider";
import { MockAvatarProvider } from "../src/lib/avatar/mockAvatarProvider";
import { resolveAvatarProvider } from "../src/lib/avatar/avatarProvider";
import { generateAvatarVideo } from "../src/lib/avatar/avatarService";
import { POST as avatarPostRoute } from "../src/app/api/article/avatar/route";
import { GET as audioBridgeGetRoute } from "../src/app/api/article/tts/audio/[audioId]/route";
import { ProcessingStatus } from "../src/components/chat/ProcessingStatus";
import { AvatarResultCard } from "../src/components/chat/AvatarResultCard";
import { ChatMessage } from "../src/components/chat/ChatMessage";
import { DEFAULT_PIPELINE_STEPS } from "../src/lib/simulation";
import { Message, ProcessingStep } from "../src/types/chat";
import {
  base64ToBlob,
  blobToBase64,
  getCachedUrlPipeline,
  normalizeCacheKeyUrl,
  saveCachedUrlPipeline,
  StorageLike,
} from "../src/lib/cache/pipelineCache";

const SAMPLE_PRESENTER_IMAGE_URL =
  "https://images.example.com/presenters/hemang-studio-portrait.jpg";
const SAMPLE_PUBLIC_AUDIO_URL =
  "https://cdn.example.com/audio/elevenlabs-narration-123.mp3";
const SAMPLE_RESULT_VIDEO_URL =
  "https://d-id-videos-prod.s3.us-west-2.amazonaws.com/tlk_987654/result.mp4";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

async function runPhase6Tests() {
  console.log("=======================================================");
  console.log("RUNNING PHASE 6 AVATAR, MOCK PROVIDER & CACHE TESTS (32 CASES)");
  console.log("=======================================================\n");

  const savedDidKey = process.env.D_ID_API_KEY;
  const savedDidImage = process.env.D_ID_SOURCE_IMAGE_URL;
  const savedAvatarProvider = process.env.AVATAR_PROVIDER;

  try {
    process.env.AVATAR_PROVIDER = "did";
    // =========================================================================
    // CONFIGURATION TESTS (1–4)
    // =========================================================================

    // Test 1: Missing D-ID API key
    console.log("[Test 1] Testing missing D-ID API key...");
    delete process.env.D_ID_API_KEY;
    await assert.rejects(
      async () => {
        await generateAvatarVideo(
          { audioUrl: SAMPLE_PUBLIC_AUDIO_URL },
          {
            apiKey: "",
            sourceImageUrl: SAMPLE_PRESENTER_IMAGE_URL,
          }
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AvatarServiceError);
        assert.equal(err.code, "MISSING_API_KEY");
        assert.equal(err.statusCode, 500);
        return true;
      }
    );
    console.log("✓ Test 1 Passed\n");

    // Test 2: Missing presenter image URL
    console.log("[Test 2] Testing missing presenter image URL...");
    delete process.env.D_ID_SOURCE_IMAGE_URL;
    await assert.rejects(
      async () => {
        await generateAvatarVideo(
          { audioUrl: SAMPLE_PUBLIC_AUDIO_URL },
          {
            apiKey: "test_user:test_secret",
            sourceImageUrl: "",
          }
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AvatarServiceError);
        assert.equal(err.code, "MISSING_SOURCE_IMAGE_URL");
        assert.equal(err.statusCode, 500);
        return true;
      }
    );
    console.log("✓ Test 2 Passed\n");

    // Test 3: Missing provider configuration
    console.log("[Test 3] Testing missing provider configuration...");
    assert.throws(
      () => {
        resolveAvatarProvider({ providerName: "   " });
      },
      (err: unknown) => {
        assert.ok(err instanceof AvatarServiceError);
        assert.equal(err.code, "MISSING_PROVIDER_CONFIG");
        assert.equal(err.statusCode, 500);
        return true;
      }
    );
    console.log("✓ Test 3 Passed\n");

    // Test 4: Invalid provider configuration
    console.log("[Test 4] Testing invalid/unsupported provider configuration...");
    assert.throws(
      () => {
        resolveAvatarProvider({ providerName: "heygen" });
      },
      (err: unknown) => {
        assert.ok(err instanceof AvatarServiceError);
        assert.equal(err.code, "UNSUPPORTED_PROVIDER");
        assert.equal(err.statusCode, 500);
        return true;
      }
    );
    console.log("✓ Test 4 Passed\n");

    // =========================================================================
    // REQUEST VALIDATION TESTS (5–8)
    // =========================================================================

    // Test 5: Missing audio
    console.log("[Test 5] Testing missing audio reference...");
    await assert.rejects(
      async () => {
        await generateAvatarVideo(
          {},
          {
            apiKey: "test_user:test_secret",
            sourceImageUrl: SAMPLE_PRESENTER_IMAGE_URL,
          }
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AvatarServiceError);
        assert.equal(err.code, "MISSING_AUDIO");
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
    console.log("✓ Test 5 Passed\n");

    // Test 6: Invalid audio reference
    console.log("[Test 6] Testing invalid audio reference...");
    await assert.rejects(
      async () => {
        await generateAvatarVideo(
          { audioUrl: "not-a-valid-url" },
          {
            apiKey: "test_user:test_secret",
            sourceImageUrl: SAMPLE_PRESENTER_IMAGE_URL,
          }
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AvatarServiceError);
        assert.equal(err.code, "INVALID_AUDIO_REFERENCE");
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
    console.log("✓ Test 6 Passed\n");

    // Test 7: Invalid request body
    console.log("[Test 7] Testing invalid request structure (400)...");
    await assert.rejects(
      async () => {
        await generateAvatarVideo(null);
      },
      (err: unknown) => {
        assert.ok(err instanceof AvatarServiceError);
        assert.equal(err.code, "INVALID_REQUEST");
        assert.equal(err.statusCode, 400);
        return true;
      }
    );

    const invalidRouteReq = new NextRequest("http://localhost:3000/api/article/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify("invalid-string-body"),
    });
    const invalidRouteRes = await avatarPostRoute(invalidRouteReq);
    assert.equal(invalidRouteRes.status, 400);
    const invalidRouteData = await invalidRouteRes.json();
    assert.equal(invalidRouteData.success, false);
    assert.equal(invalidRouteData.error.code, "INVALID_REQUEST");
    console.log("✓ Test 7 Passed\n");

    // Test 8: Invalid presenter configuration (blob URL / localhost / malformed)
    console.log("[Test 8] Testing invalid presenter image configuration...");
    for (const badImageUrl of [
      "blob:http://localhost:3000/presenter-photo-123",
      "http://localhost:3000/presenter.jpg",
      "ftp://files.example.com/photo.jpg",
      "not-a-url",
    ]) {
      await assert.rejects(
        async () => {
          await generateAvatarVideo(
            { audioUrl: SAMPLE_PUBLIC_AUDIO_URL },
            {
              apiKey: "test_user:test_secret",
              sourceImageUrl: badImageUrl,
            }
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof AvatarServiceError);
          assert.equal(err.code, "INVALID_PRESENTER_CONFIG");
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    }
    console.log("✓ Test 8 Passed\n");

    // =========================================================================
    // D-ID PROVIDER TESTS (9–18)
    // =========================================================================

    // Tests 9 & 10: Successful Talk creation + Polling from created -> started -> done
    console.log("[Tests 9 & 10] Testing D-ID Talk creation and polling (created -> started -> done)...");
    const recordedCalls: { url: string; method: string; body?: unknown; auth?: string }[] = [];
    let pollCallCount = 0;

    const mockFetchSuccess: FetchLike = async (input, init) => {
      const url = String(input);
      const method = init?.method || "GET";
      const headers = (init?.headers || {}) as Record<string, string>;
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

      recordedCalls.push({
        url,
        method,
        body,
        auth: headers.Authorization,
      });

      if (method === "POST" && url.endsWith("/talks")) {
        return jsonResponse({ id: "tlk_test_987", status: "created" }, 201);
      }

      if (method === "GET" && url.endsWith("/talks/tlk_test_987")) {
        pollCallCount++;
        if (pollCallCount === 1) {
          return jsonResponse({ id: "tlk_test_987", status: "created" }, 200);
        }
        if (pollCallCount === 2) {
          return jsonResponse({ id: "tlk_test_987", status: "started" }, 200);
        }
        return jsonResponse(
          {
            id: "tlk_test_987",
            status: "done",
            result_url: SAMPLE_RESULT_VIDEO_URL,
            duration: 14.8,
          },
          200
        );
      }

      return jsonResponse({ message: "Unexpected endpoint" }, 404);
    };

    const sleepDurations: number[] = [];
    const providerSuccess = new DidProvider({
      apiKey: "did_user:did_secret",
      sourceImageUrl: SAMPLE_PRESENTER_IMAGE_URL,
      pollIntervalMs: 3000,
      maxPollAttempts: 20,
      fetchFn: mockFetchSuccess,
      sleepFn: async (ms) => {
        sleepDurations.push(ms);
      },
    });

    const videoResult = await providerSuccess.createTalkingVideo({
      audioUrl: SAMPLE_PUBLIC_AUDIO_URL,
      presenterName: "Hemang",
    });

    // Verify Test 9: POST /talks payload uses source_url and script.type = "audio" (never text/TTS)
    assert.equal(recordedCalls.length, 4, "1 POST /talks + 3 GET /talks/{id} polls");
    assert.equal(recordedCalls[0].method, "POST");
    assert.equal(recordedCalls[0].url, "https://api.d-id.com/talks");
    assert.equal(recordedCalls[0].auth, "Basic did_user:did_secret");
    assert.deepEqual(recordedCalls[0].body, {
      source_url: SAMPLE_PRESENTER_IMAGE_URL,
      script: {
        type: "audio",
        audio_url: SAMPLE_PUBLIC_AUDIO_URL,
      },
    });

    // Verify Test 10: Polling progression and normalized result
    assert.deepEqual(sleepDurations, [3000, 3000, 3000]);
    assert.equal(videoResult.videoUrl, SAMPLE_RESULT_VIDEO_URL);
    assert.equal(videoResult.provider, "did");
    assert.equal(videoResult.providerVideoId, "tlk_test_987");
    assert.equal(videoResult.status, "completed");
    assert.equal(videoResult.durationSeconds, 14.8);
    assert.equal(videoResult.presenterName, "Hemang");
    console.log("✓ Tests 9 & 10 Passed\n");

    // Test 11: Failed D-ID generation (status = "error" / "rejected")
    console.log("[Test 11] Testing failed D-ID generation (status = error)...");
    const mockFetchFailedStatus: FetchLike = async (input, init) => {
      const method = init?.method || "GET";
      if (method === "POST") {
        return jsonResponse({ id: "tlk_fail_1", status: "created" }, 201);
      }
      return jsonResponse({ id: "tlk_fail_1", status: "error" }, 200);
    };

    const providerFailedStatus = new DidProvider({
      apiKey: "did_user:did_secret",
      sourceImageUrl: SAMPLE_PRESENTER_IMAGE_URL,
      fetchFn: mockFetchFailedStatus,
      sleepFn: async () => {},
    });

    await assert.rejects(
      async () => {
        await providerFailedStatus.createTalkingVideo({
          audioUrl: SAMPLE_PUBLIC_AUDIO_URL,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AvatarServiceError);
        assert.equal(err.code, "AVATAR_GENERATION_FAILED");
        assert.equal(err.statusCode, 502);
        return true;
      }
    );
    console.log("✓ Test 11 Passed\n");

    // Test 12: Poll timeout
    console.log("[Test 12] Testing D-ID polling timeout (504)...");
    let timeoutPolls = 0;
    const mockFetchTimeout: FetchLike = async (_input, init) => {
      const method = init?.method || "GET";
      if (method === "POST") {
        return jsonResponse({ id: "tlk_slow_1", status: "created" }, 201);
      }
      timeoutPolls++;
      return jsonResponse({ id: "tlk_slow_1", status: "started" }, 200);
    };

    const providerTimeout = new DidProvider({
      apiKey: "did_user:did_secret",
      sourceImageUrl: SAMPLE_PRESENTER_IMAGE_URL,
      maxPollAttempts: 4,
      fetchFn: mockFetchTimeout,
      sleepFn: async () => {},
    });

    await assert.rejects(
      async () => {
        await providerTimeout.createTalkingVideo({
          audioUrl: SAMPLE_PUBLIC_AUDIO_URL,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AvatarServiceError);
        assert.equal(err.code, "AVATAR_TIMEOUT");
        assert.equal(err.statusCode, 504);
        return true;
      }
    );
    assert.equal(timeoutPolls, 4, "Must stop polling after maxPollAttempts");
    console.log("✓ Test 12 Passed\n");

    // Test 13: 401 response
    console.log("[Test 13] Testing D-ID 401 unauthorized response (no credential leakage)...");
    const secretDidKey = "secret_did_user_999:super_secret_password_999";
    const provider401 = new DidProvider({
      apiKey: secretDidKey,
      sourceImageUrl: SAMPLE_PRESENTER_IMAGE_URL,
      fetchFn: async () => jsonResponse({ message: `Invalid key ${secretDidKey}` }, 401),
      sleepFn: async () => {},
    });

    await assert.rejects(
      async () => {
        await provider401.createTalkingVideo({ audioUrl: SAMPLE_PUBLIC_AUDIO_URL });
      },
      (err: unknown) => {
        assert.ok(err instanceof AvatarServiceError);
        assert.equal(err.code, "AVATAR_AUTH_ERROR");
        assert.equal(err.statusCode, 401);
        assert.ok(!err.message.includes(secretDidKey), "Must never leak D-ID API key");
        return true;
      }
    );
    console.log("✓ Test 13 Passed\n");

    // Test 14: 402 response (insufficient credits)
    console.log("[Test 14] Testing D-ID 402 insufficient credits response...");
    const provider402 = new DidProvider({
      apiKey: "did_user:did_secret",
      sourceImageUrl: SAMPLE_PRESENTER_IMAGE_URL,
      fetchFn: async () => jsonResponse({ kind: "InsufficientCreditsError" }, 402),
      sleepFn: async () => {},
    });

    await assert.rejects(
      async () => {
        await provider402.createTalkingVideo({ audioUrl: SAMPLE_PUBLIC_AUDIO_URL });
      },
      (err: unknown) => {
        assert.ok(err instanceof AvatarServiceError);
        assert.equal(err.code, "AVATAR_INSUFFICIENT_CREDITS");
        assert.equal(err.statusCode, 402);
        return true;
      }
    );
    console.log("✓ Test 14 Passed\n");

    // Test 15: 403 response (forbidden)
    console.log("[Test 15] Testing D-ID 403 forbidden response...");
    const provider403 = new DidProvider({
      apiKey: "did_user:did_secret",
      sourceImageUrl: SAMPLE_PRESENTER_IMAGE_URL,
      fetchFn: async () => jsonResponse({ message: "Forbidden" }, 403),
      sleepFn: async () => {},
    });

    await assert.rejects(
      async () => {
        await provider403.createTalkingVideo({ audioUrl: SAMPLE_PUBLIC_AUDIO_URL });
      },
      (err: unknown) => {
        assert.ok(err instanceof AvatarServiceError);
        assert.equal(err.code, "AVATAR_FORBIDDEN");
        assert.equal(err.statusCode, 403);
        return true;
      }
    );
    console.log("✓ Test 15 Passed\n");

    // Test 16: 429 response (rate limited)
    console.log("[Test 16] Testing D-ID 429 rate-limit response...");
    const provider429 = new DidProvider({
      apiKey: "did_user:did_secret",
      sourceImageUrl: SAMPLE_PRESENTER_IMAGE_URL,
      fetchFn: async () => jsonResponse({ message: "Too Many Requests" }, 429),
      sleepFn: async () => {},
    });

    await assert.rejects(
      async () => {
        await provider429.createTalkingVideo({ audioUrl: SAMPLE_PUBLIC_AUDIO_URL });
      },
      (err: unknown) => {
        assert.ok(err instanceof AvatarServiceError);
        assert.equal(err.code, "AVATAR_RATE_LIMIT");
        assert.equal(err.statusCode, 429);
        return true;
      }
    );
    console.log("✓ Test 16 Passed\n");

    // Test 17: Provider 5xx response
    console.log("[Test 17] Testing D-ID 5xx provider failure (502)...");
    const provider500 = new DidProvider({
      apiKey: "did_user:did_secret",
      sourceImageUrl: SAMPLE_PRESENTER_IMAGE_URL,
      fetchFn: async () => jsonResponse({ message: "Internal Server Error" }, 503),
      sleepFn: async () => {},
    });

    await assert.rejects(
      async () => {
        await provider500.createTalkingVideo({ audioUrl: SAMPLE_PUBLIC_AUDIO_URL });
      },
      (err: unknown) => {
        assert.ok(err instanceof AvatarServiceError);
        assert.equal(err.code, "AVATAR_PROVIDER_ERROR");
        assert.equal(err.statusCode, 502);
        return true;
      }
    );
    console.log("✓ Test 17 Passed\n");

    // Test 18: Malformed D-ID response
    console.log("[Test 18] Testing malformed D-ID responses (missing id or missing result_url)...");
    const providerMalformedCreate = new DidProvider({
      apiKey: "did_user:did_secret",
      sourceImageUrl: SAMPLE_PRESENTER_IMAGE_URL,
      fetchFn: async () => new Response("<<<not json>>>", { status: 201 }),
      sleepFn: async () => {},
    });

    await assert.rejects(
      async () => {
        await providerMalformedCreate.createTalkingVideo({
          audioUrl: SAMPLE_PUBLIC_AUDIO_URL,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AvatarServiceError);
        assert.equal(err.code, "AVATAR_PROVIDER_ERROR");
        assert.equal(err.statusCode, 502);
        return true;
      }
    );

    const providerMalformedDone = new DidProvider({
      apiKey: "did_user:did_secret",
      sourceImageUrl: SAMPLE_PRESENTER_IMAGE_URL,
      fetchFn: async (_input, init) => {
        if ((init?.method || "GET") === "POST") {
          return jsonResponse({ id: "tlk_malformed_done" }, 201);
        }
        // status = "done" but missing result_url
        return jsonResponse({ id: "tlk_malformed_done", status: "done" }, 200);
      },
      sleepFn: async () => {},
    });

    await assert.rejects(
      async () => {
        await providerMalformedDone.createTalkingVideo({
          audioUrl: SAMPLE_PUBLIC_AUDIO_URL,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof AvatarServiceError);
        assert.equal(err.code, "AVATAR_PROVIDER_ERROR");
        assert.equal(err.statusCode, 502);
        return true;
      }
    );
    console.log("✓ Test 18 Passed\n");

    // =========================================================================
    // AUDIO BRIDGE TESTS (19–21)
    // =========================================================================

    // Test 19: Browser Blob/Object URL must NOT be passed directly to D-ID
    console.log("[Test 19] Testing that Browser Blob/Object URLs are strictly rejected...");
    for (const browserOnlyUrl of [
      "blob:http://localhost:3000/550e8400-e29b-41d4-a716-446655440000",
      "blob:https://newsai.example.com/1234-5678",
      "data:audio/mpeg;base64,SUQzBAAAAAA=",
    ]) {
      assert.throws(
        () => validatePublicAudioUrl(browserOnlyUrl),
        (err: unknown) => {
          assert.ok(err instanceof AvatarServiceError);
          assert.equal(err.code, "INVALID_AUDIO_REFERENCE");
          assert.equal(err.statusCode, 400);
          return true;
        }
      );

      const blobReq = new NextRequest("http://localhost:3000/api/article/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl: browserOnlyUrl }),
      });
      const blobRes = await avatarPostRoute(blobReq);
      assert.equal(blobRes.status, 400);
      const blobJson = await blobRes.json();
      assert.equal(blobJson.success, false);
      assert.equal(blobJson.error.code, "INVALID_AUDIO_REFERENCE");
    }
    console.log("✓ Test 19 Passed\n");

    // Test 20: Temporary/public audio URL validation & server audio bridge
    console.log("[Test 20] Testing temporary server audio store & GET /api/article/tts/audio/[audioId]...");
    clearTemporaryAudioStore();
    const sampleMp3Bytes = Buffer.from([0xff, 0xfb, 0x90, 0x64, 0x11, 0x22, 0x33, 0x44]);
    const tempEntry = registerTemporaryAudio(sampleMp3Bytes, "audio/mpeg");

    assert.ok(tempEntry.id.startsWith("aud_"), "Audio ID must have aud_ prefix");
    const fetchedEntry = getTemporaryAudio(tempEntry.id);
    assert.ok(fetchedEntry, "Must retrieve registered audio entry");
    assert.deepEqual(fetchedEntry.buffer, sampleMp3Bytes);

    const bridgeUrl = buildTemporaryAudioUrl(
      tempEntry.id,
      "https://studio.newsai.example.com"
    );
    assert.equal(
      bridgeUrl,
      `https://studio.newsai.example.com/api/article/tts/audio/${tempEntry.id}`
    );

    // Test GET /api/article/tts/audio/[audioId] route handler
    const getAudioReq = new NextRequest(
      `http://localhost:3000/api/article/tts/audio/${tempEntry.id}`
    );
    const getAudioRes = await audioBridgeGetRoute(getAudioReq, {
      params: Promise.resolve({ audioId: tempEntry.id }),
    });
    assert.equal(getAudioRes.status, 200);
    assert.equal(getAudioRes.headers.get("Content-Type"), "audio/mpeg");
    const servedBytes = Buffer.from(await getAudioRes.arrayBuffer());
    assert.deepEqual(servedBytes, sampleMp3Bytes);

    // Verify D-ID provider can consume the bridged audioId (staging via /audios when local)
    let uploadedAudioBytes = 0;
    let talkAudioUrlUsed = "";
    const mockFetchBridge: FetchLike = async (input, init) => {
      const url = String(input);
      const method = init?.method || "GET";
      if (method === "POST" && url.endsWith("/audios")) {
        uploadedAudioBytes = sampleMp3Bytes.byteLength;
        return jsonResponse(
          {
            id: "aud_did_1",
            url: "https://d-id-audios-production.s3.amazonaws.com/upload/aud_did_1.mp3",
          },
          201
        );
      }
      if (method === "POST" && url.endsWith("/talks")) {
        const body = JSON.parse(String(init?.body));
        talkAudioUrlUsed = body.script.audio_url;
        return jsonResponse({ id: "tlk_bridge_1", status: "created" }, 201);
      }
      return jsonResponse(
        {
          id: "tlk_bridge_1",
          status: "done",
          result_url: SAMPLE_RESULT_VIDEO_URL,
          duration: 12.4,
        },
        200
      );
    };

    const bridgeResult = await generateAvatarVideo(
      { audioId: tempEntry.id },
      {
        apiKey: "did_user:did_secret",
        sourceImageUrl: SAMPLE_PRESENTER_IMAGE_URL,
        fetchFn: mockFetchBridge,
        sleepFn: async () => {},
      }
    );
    assert.equal(uploadedAudioBytes, sampleMp3Bytes.byteLength);
    assert.equal(
      talkAudioUrlUsed,
      "https://d-id-audios-production.s3.amazonaws.com/upload/aud_did_1.mp3"
    );
    assert.equal(bridgeResult.videoUrl, SAMPLE_RESULT_VIDEO_URL);
    console.log("✓ Test 20 Passed\n");

    // Test 21: Audio MIME/type validation
    console.log("[Test 21] Testing audio MIME type validation...");
    assert.equal(validateAudioMimeType("audio/mpeg"), "audio/mpeg");
    assert.equal(validateAudioMimeType("audio/mp3"), "audio/mpeg");
    assert.equal(validateAudioMimeType("audio/wav; codecs=1"), "audio/wav");

    for (const invalidMime of ["text/html", "image/jpeg", "video/mp4", "application/json", ""]) {
      assert.throws(
        () => validateAudioMimeType(invalidMime),
        (err: unknown) => {
          assert.ok(err instanceof AvatarServiceError);
          assert.equal(err.code, "INVALID_AUDIO_MIME_TYPE");
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    }
    console.log("✓ Test 21 Passed\n");

    // =========================================================================
    // FRONTEND TESTS (22–24)
    // =========================================================================

    // Test 22: Avatar generation loading state
    console.log("[Test 22] Testing frontend avatar generation loading state ('Generating presenter...')...");
    const loadingSteps: ProcessingStep[] = DEFAULT_PIPELINE_STEPS.map((s, idx) => ({
      ...s,
      status: idx < 5 ? "completed" : "processing",
    }));

    const loadingStatusHtml = renderToStaticMarkup(
      React.createElement(ProcessingStatus, {
        steps: loadingSteps,
        currentStepIndex: 5,
        isProcessing: true,
      })
    );

    assert.ok(
      loadingStatusHtml.includes("Generating presenter..."),
      "ProcessingStatus must display 'Generating presenter...' during Phase 6"
    );
    assert.ok(
      loadingStatusHtml.includes("Animating presenter portrait with lip-sync via D-ID"),
      "ProcessingStatus must show D-ID lip-sync description"
    );
    console.log("✓ Test 22 Passed\n");

    // Test 23: Avatar result rendering
    console.log("[Test 23] Testing AvatarResultCard and ChatMessage <video controls /> rendering...");
    const avatarMeta = {
      videoUrl: SAMPLE_RESULT_VIDEO_URL,
      provider: "did" as const,
      providerVideoId: "tlk_987654",
      status: "completed" as const,
      durationSeconds: 15.2,
      presenterName: "Hemang",
      scriptTitle: "India Dominates Bangladesh in Asian Champions Trophy Opener",
      generatedAt: "2026-10-29T10:00:00.000Z",
    };

    const avatarCardHtml = renderToStaticMarkup(
      React.createElement(AvatarResultCard, { avatar: avatarMeta })
    );
    assert.ok(avatarCardHtml.includes("AI Presenter Video Ready"), "Must render header");
    assert.ok(avatarCardHtml.includes("Avatar video ready"), "Must render ready badge");
    assert.ok(avatarCardHtml.includes("Presenter: Hemang"), "Must render presenter name");
    assert.ok(avatarCardHtml.includes("<video"), "Must render native <video> element");
    assert.ok(avatarCardHtml.includes("controls"), "Video element must include controls");
    assert.ok(
      avatarCardHtml.includes(`src="${SAMPLE_RESULT_VIDEO_URL}"`),
      "Video element must bind videoUrl"
    );

    const avatarChatMessage: Message = {
      id: "avatar-msg-1",
      role: "assistant",
      type: "avatar",
      content: "Avatar video ready.",
      metadata: {
        avatar: avatarMeta,
      },
      createdAt: "2026-10-29T10:00:00.000Z",
    };
    const chatMessageHtml = renderToStaticMarkup(
      React.createElement(ChatMessage, { message: avatarChatMessage })
    );
    assert.ok(
      chatMessageHtml.includes("AI Presenter Video Ready") &&
        chatMessageHtml.includes("<video"),
      "ChatMessage must render AvatarResultCard for type='avatar'"
    );
    console.log("✓ Test 23 Passed\n");

    // Test 24: Avatar error state
    console.log("[Test 24] Testing frontend avatar error state rendering...");
    const errorSteps: ProcessingStep[] = DEFAULT_PIPELINE_STEPS.map((s, idx) => ({
      ...s,
      status: idx < 5 ? "completed" : "error",
      label: idx === 5 ? "Presenter generation failed" : s.label,
      description:
        idx === 5 ? "Insufficient D-ID credits to generate presenter video." : s.description,
    }));

    const errorStatusHtml = renderToStaticMarkup(
      React.createElement(ProcessingStatus, {
        steps: errorSteps,
        currentStepIndex: 5,
        isProcessing: false,
      })
    );
    assert.ok(errorStatusHtml.includes("Presenter generation failed"));
    assert.ok(errorStatusHtml.includes("Failed"));

    const failedCardHtml = renderToStaticMarkup(
      React.createElement(AvatarResultCard, {
        avatar: {
          ...avatarMeta,
          status: "failed",
          videoUrl: "",
        },
        errorMessage: "Avatar provider timed out while processing the video.",
      })
    );
    assert.ok(failedCardHtml.includes("Presenter Video Generation Failed"));
    assert.ok(
      failedCardHtml.includes("Avatar provider timed out while processing the video.")
    );
    console.log("✓ Test 24 Passed\n");

    // Test 25: Browser localStorage URL Pipeline Cache
    console.log("[Test 25] Testing browser localStorage URL pipeline cache...");
    const memoryMap = new Map<string, string>();
    const mockLocalStorage: StorageLike = {
      getItem: (k) => memoryMap.get(k) ?? null,
      setItem: (k, v) => {
        memoryMap.set(k, v);
      },
      removeItem: (k) => {
        memoryMap.delete(k);
      },
    };

    const urlVariantA = "https://www.Cricinfo.com/story/icc-rankings-1560404/";
    const urlVariantB = "https://www.cricinfo.com/story/icc-rankings-1560404#comments";
    assert.equal(
      normalizeCacheKeyUrl(urlVariantA),
      normalizeCacheKeyUrl(urlVariantB),
      "URL variants with trailing slash or hash must map to identical cache key"
    );

    const testAudioBytes = new Uint8Array([10, 20, 30, 40, 50]);
    const testBlob = new Blob([testAudioBytes], { type: "audio/mpeg" });
    const b64 = await blobToBase64(testBlob);
    const restoredBlob = base64ToBlob(b64, "audio/mpeg");
    assert.deepEqual(
      new Uint8Array(await restoredBlob.arrayBuffer()),
      testAudioBytes
    );

    saveCachedUrlPipeline(
      urlVariantA,
      {
        domain: "cricinfo.com",
        avatar: avatarMeta,
      },
      mockLocalStorage
    );

    const hit = getCachedUrlPipeline(urlVariantB, mockLocalStorage);
    assert.ok(hit, "Must hit cache for normalized URL variant");
    assert.equal(hit.avatar?.videoUrl, SAMPLE_RESULT_VIDEO_URL);
    console.log("✓ Test 25 Passed\n");

    // =========================================================================
    // MOCK AVATAR PROVIDER TESTS (26–32)
    // =========================================================================

    // Test 26: Verify public/presenter.mp4 exists directly at expected path
    console.log("[Test 26] Verifying public/presenter.mp4 fixture exists on disk...");
    assert.ok(
      fs.existsSync("public/presenter.mp4"),
      "public/presenter.mp4 must exist directly in public/"
    );
    const presenterStat = fs.statSync("public/presenter.mp4");
    assert.ok(presenterStat.size > 0, "public/presenter.mp4 must be non-empty");
    console.log("✓ Test 26 Passed\n");

    // Test 27: AVATAR_PROVIDER=mock resolves MockAvatarProvider, and AVATAR_PROVIDER=did resolves DidProvider
    console.log("[Test 27] Testing AVATAR_PROVIDER=mock vs AVATAR_PROVIDER=did resolution...");
    process.env.AVATAR_PROVIDER = "mock";
    const resolvedMock = resolveAvatarProvider();
    assert.ok(
      resolvedMock instanceof MockAvatarProvider,
      "AVATAR_PROVIDER=mock must resolve MockAvatarProvider"
    );

    process.env.AVATAR_PROVIDER = "did";
    const resolvedDid = resolveAvatarProvider();
    assert.ok(
      resolvedDid instanceof DidProvider,
      "AVATAR_PROVIDER=did must still resolve DidProvider"
    );
    console.log("✓ Test 27 Passed\n");

    // Tests 28, 29, 30, 31: MockAvatarProvider returns /presenter.mp4, works without D_ID_API_KEY, and makes zero D-ID API calls
    console.log(
      "[Tests 28–31] Testing MockAvatarProvider output (/presenter.mp4), zero D-ID API calls, and no D_ID_API_KEY required..."
    );
    delete process.env.D_ID_API_KEY;
    delete process.env.D_ID_SOURCE_IMAGE_URL;
    process.env.AVATAR_PROVIDER = "mock";

    const originalFetch = globalThis.fetch;
    let externalFetchCalled = false;
    globalThis.fetch = async () => {
      externalFetchCalled = true;
      throw new Error("MockAvatarProvider must NEVER make any external fetch/D-ID calls!");
    };

    try {
      const mockResult = await generateAvatarVideo({
        audioUrl: SAMPLE_PUBLIC_AUDIO_URL,
      });

      assert.equal(mockResult.videoUrl, "/presenter.mp4");
      assert.equal(mockResult.provider, "mock");
      assert.equal(mockResult.status, "completed");
      assert.equal(mockResult.presenterName, "Hemang");
      assert.equal(externalFetchCalled, false, "Zero D-ID API calls must be made in mock mode");

      // Test 32: POST /api/article/avatar route in mock mode returns /presenter.mp4 and renders in AvatarResultCard
      console.log("[Test 32] Testing POST /api/article/avatar route and AvatarResultCard in mock mode...");
      const mockRouteReq = new NextRequest("http://localhost:3000/api/article/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioUrl: SAMPLE_PUBLIC_AUDIO_URL,
        }),
      });
      const mockRouteRes = await avatarPostRoute(mockRouteReq);
      assert.equal(mockRouteRes.status, 200);
      const mockRouteJson = await mockRouteRes.json();
      assert.equal(mockRouteJson.success, true);
      assert.equal(mockRouteJson.videoUrl, "/presenter.mp4");
      assert.equal(mockRouteJson.provider, "mock");
      assert.equal(mockRouteJson.status, "completed");
      assert.equal(externalFetchCalled, false, "Route in mock mode must make zero D-ID calls");

      const mockCardHtml = renderToStaticMarkup(
        React.createElement(AvatarResultCard, {
          avatar: mockRouteJson.avatar,
        })
      );
      assert.ok(
        mockCardHtml.includes('src="/presenter.mp4"'),
        "AvatarResultCard must render <video src=\"/presenter.mp4\" />"
      );
      console.log("✓ Tests 28–32 Passed\n");
    } finally {
      globalThis.fetch = originalFetch;
    }

    console.log("=======================================================");
    console.log("ALL 32 PHASE 6, MOCK PROVIDER & URL CACHE TESTS PASSED!");
    console.log("=======================================================");
  } finally {
    if (savedDidKey !== undefined) process.env.D_ID_API_KEY = savedDidKey;
    else delete process.env.D_ID_API_KEY;

    if (savedDidImage !== undefined) process.env.D_ID_SOURCE_IMAGE_URL = savedDidImage;
    else delete process.env.D_ID_SOURCE_IMAGE_URL;

    if (savedAvatarProvider !== undefined) process.env.AVATAR_PROVIDER = savedAvatarProvider;
    else delete process.env.AVATAR_PROVIDER;
  }
}

runPhase6Tests().catch((err) => {
  console.error("Phase 6 test suite failed:", err);
  process.exit(1);
});

