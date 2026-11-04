import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { POST as videoPostRoute } from "../src/app/api/article/video/route";
import { GET as videoGetRoute } from "../src/app/api/article/video/[videoId]/route";
import { NextRequest } from "next/server";
import { registerTemporaryAudio, clearTemporaryAudioStore } from "../src/lib/avatar/avatarUtils";
import { getFfmpegPath } from "../src/lib/video/ffmpeg";

console.log("=== Testing Phase 7A API Route Handlers ===");

async function testApiRoutes() {
  clearTemporaryAudioStore();

  // Create temporary narration tone
  const tonePath = path.join(os.tmpdir(), "api_test_tone.mp3");
  execFileSync(getFfmpegPath(), [
    "-y",
    "-f", "lavfi",
    "-i", "sine=frequency=440:duration=2",
    "-c:a", "libmp3lame",
    "-b:a", "192k",
    tonePath,
  ]);

  const toneBuffer = fs.readFileSync(tonePath);
  const audioEntry = registerTemporaryAudio(toneBuffer, "audio/mpeg");

  // 1. Test POST /api/article/video
  console.log("1. Testing POST /api/article/video...");
  const postReq = new NextRequest("http://localhost:3000/api/article/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      avatarVideoUrl: "/presenter.mp4",
      audioId: audioEntry.id,
      headline: "API TEST HEADLINE",
      sourceDomain: "testnews.com",
      newsScript: {
        title: "API TEST SCRIPT",
        hook: "Hook line",
        segments: [
          {
            id: "s1",
            type: "hook",
            text: "This is a live API test segment for video composition.",
            estimatedDurationSeconds: 2,
            claimIds: [],
          },
        ],
        fullScript: "This is a live API test segment for video composition.",
        wordCount: 10,
        estimatedDurationSeconds: 2,
        tone: "professional",
        usedClaimIds: [],
        excludedClaimIds: [],
        generatedAt: new Date().toISOString(),
      },
    }),
  });

  const postRes = await videoPostRoute(postReq);
  assert.equal(postRes.status, 200, `POST should return 200, got ${postRes.status}`);

  const postJson = await postRes.json();
  console.log("  POST Response:", postJson);
  assert.equal(postJson.success, true);
  assert.ok(postJson.videoId.startsWith("vid_"));
  assert.equal(postJson.width, 1920);
  assert.equal(postJson.height, 1080);
  assert.equal(postJson.format, "mp4");
  assert.ok(postJson.videoUrl.includes(postJson.videoId));

  // 2. Test GET /api/article/video/[videoId]
  console.log("2. Testing GET /api/article/video/[videoId]...");
  const getReq = new NextRequest(`http://localhost:3000${postJson.videoUrl}`, {
    method: "GET",
  });

  const getRes = await videoGetRoute(getReq, {
    params: Promise.resolve({ videoId: postJson.videoId }),
  });

  assert.equal(getRes.status, 200, `GET should return 200, got ${getRes.status}`);
  assert.equal(getRes.headers.get("Content-Type"), "video/mp4");
  const contentLength = Number(getRes.headers.get("Content-Length"));
  assert.ok(contentLength > 50000, `Expected video length > 50KB, got ${contentLength}`);

  // 3. Test Range request
  console.log("3. Testing HTTP Range request on GET /api/article/video/[videoId]...");
  const rangeReq = new NextRequest(`http://localhost:3000${postJson.videoUrl}`, {
    method: "GET",
    headers: { Range: "bytes=0-1023" },
  });

  const rangeRes = await videoGetRoute(rangeReq, {
    params: Promise.resolve({ videoId: postJson.videoId }),
  });

  assert.equal(rangeRes.status, 206, `Range request should return 206, got ${rangeRes.status}`);
  assert.equal(rangeRes.headers.get("Content-Range"), `bytes 0-1023/${contentLength}`);
  assert.equal(rangeRes.headers.get("Content-Length"), "1024");

  // Clean up
  if (fs.existsSync(tonePath)) {
    fs.unlinkSync(tonePath);
  }

  console.log("\n✅ All API route handler tests passed successfully!");
}

testApiRoutes().catch((err) => {
  console.error("❌ Route test failed:", err);
  process.exit(1);
});

