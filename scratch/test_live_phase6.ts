import assert from "node:assert/strict";
import fs from "node:fs";
import { synthesizeText } from "../src/lib/tts/ttsService";
import { generateAvatarVideo } from "../src/lib/avatar/avatarService";
import { registerTemporaryAudio } from "../src/lib/avatar/avatarUtils";

async function runLivePhase6Test() {
  if (fs.existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }

  const didApiKey = process.env.D_ID_API_KEY?.trim();
  if (!didApiKey) {
    console.log("SKIPPED — D_ID_API_KEY not configured");
    return;
  }

  const sourceImageUrl = process.env.D_ID_SOURCE_IMAGE_URL?.trim();
  if (!sourceImageUrl) {
    console.log("SKIPPED — D_ID_SOURCE_IMAGE_URL not configured");
    return;
  }

  const elevenLabsKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!elevenLabsKey) {
    console.log("SKIPPED — ELEVENLABS_API_KEY not configured for audio input");
    return;
  }

  console.log("=======================================================");
  console.log("RUNNING LIVE PHASE 6 D-ID AVATAR + LIP-SYNC TEST");
  console.log("=======================================================");
  console.log(`Presenter Image: ${sourceImageUrl}`);

  // 1. Generate authoritative voice audio using ElevenLabs TTS (Phase 5)
  console.log("\n[Step 1] Synthesizing presenter speech via ElevenLabs TTS...");
  const ttsResult = await synthesizeText({
    text: "Good evening. Welcome to NewsAI Studio with tonight's top verified headline.",
  });

  assert.ok(Buffer.isBuffer(ttsResult.audio) && ttsResult.audio.byteLength > 100);
  console.log(`  ElevenLabs MP3 size: ${ttsResult.audio.byteLength} bytes`);

  // 2. Register in server-side temporary audio bridge
  const tempAudio = registerTemporaryAudio(ttsResult.audio, ttsResult.mimeType);
  console.log(`  Registered temporary server audio ID: ${tempAudio.id}`);

  // 3. Generate talking-head video via D-ID Talks API (Phase 6)
  console.log("\n[Step 2] Creating D-ID Talk and polling until completion...");
  const startTime = Date.now();
  const avatarResult = await generateAvatarVideo({
    audioId: tempAudio.id,
    mimeType: tempAudio.mimeType,
  });
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

  assert.equal(avatarResult.status, "completed");
  assert.equal(avatarResult.provider, "did");
  assert.ok(avatarResult.providerVideoId.length > 0);
  assert.ok(avatarResult.videoUrl.startsWith("http"));

  console.log("\nPASSED — D-ID generated video successfully");
  console.log(`  Elapsed time:      ${elapsedSec}s`);
  console.log(`  Provider Video ID: ${avatarResult.providerVideoId}`);
  console.log(`  Video URL:         ${avatarResult.videoUrl}`);
  if (avatarResult.durationSeconds !== undefined) {
    console.log(`  Duration:          ${avatarResult.durationSeconds}s`);
  }
}

runLivePhase6Test().catch((err) => {
  console.error("Live Phase 6 test failed:", err);
  process.exit(1);
});

