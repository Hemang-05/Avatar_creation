import assert from "node:assert/strict";
import fs from "node:fs";
import { synthesizeText } from "../src/lib/tts/ttsService";
import {
  DEFAULT_ELEVENLABS_MODEL_ID,
  DEFAULT_ELEVENLABS_VOICE_ID,
  FALLBACK_FREE_TIER_ELEVENLABS_VOICE_ID,
} from "../src/lib/tts/ttsTypes";

async function runLivePhase5Test() {
  if (fs.existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    console.log(
      "[Live TTS Test] Skipping live ElevenLabs API call: ELEVENLABS_API_KEY is not configured in .env.local."
    );
    return;
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_ELEVENLABS_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_ELEVENLABS_MODEL_ID;

  console.log("=======================================================");
  console.log("RUNNING LIVE PHASE 5 ELEVENLABS TTS TEST");
  console.log("=======================================================");
  console.log(`Voice ID: ${voiceId}`);
  console.log(`Model ID: ${modelId}`);

  const startTime = Date.now();
  const result = await synthesizeText({
    text: "Breaking news from the studio desk: India opens its tournament campaign with a decisive victory.",
    voiceId,
    modelId,
  });

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);

  assert.ok(Buffer.isBuffer(result.audio), "Returned audio must be a Buffer");
  assert.ok(result.audio.byteLength > 100, "Returned MP3 audio must be non-empty");
  assert.equal(result.mimeType, "audio/mpeg", "MIME type must be audio/mpeg");
  assert.equal(result.provider, "elevenlabs");
  assert.ok(
    result.voiceId === voiceId ||
      result.voiceId === FALLBACK_FREE_TIER_ELEVENLABS_VOICE_ID,
    "Voice ID must match configured voice or free-tier presenter fallback"
  );
  assert.equal(result.modelId, modelId);

  console.log(`\n✓ Live TTS synthesis succeeded in ${elapsedSec}s!`);
  console.log(`  Audio size: ${result.audio.byteLength} bytes`);
  console.log(`  MIME type:  ${result.mimeType}`);
  console.log(`  Provider:   ${result.provider}`);
  console.log(`  Voice ID:   ${result.voiceId}`);
}

runLivePhase5Test().catch((err) => {
  console.error("Live Phase 5 test failed:", err);
  process.exit(1);
});

