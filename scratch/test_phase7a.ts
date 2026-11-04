import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import {
  formatAssTime,
  splitTextIntoChunks,
  generateCaptionSegments,
  generateAssSubtitles,
} from "../src/lib/video/captionGenerator";
import { escapeFilterPath } from "../src/lib/video/composition";
import { getFfmpegPath, probeMediaDuration, runFfmpeg } from "../src/lib/video/ffmpeg";
import {
  registerVideo,
  getStoredVideo,
  pruneExpiredVideos,
  clearVideoStore,
} from "../src/lib/video/videoStore";
import { composeVideoService } from "../src/lib/video/videoService";
import { registerTemporaryAudio, clearTemporaryAudioStore } from "../src/lib/avatar/avatarUtils";
import type { NewsScript } from "../src/lib/script/scriptTypes";

console.log("=== Starting Phase 7A Video Composition Test Suite ===\n");

async function runTests() {
  // -------------------------------------------------------------
  // Test 1: ASS Time Formatting
  // -------------------------------------------------------------
  console.log("Test 1: ASS Time Formatting...");
  assert.equal(formatAssTime(0), "0:00:00.00");
  assert.equal(formatAssTime(65.5), "0:01:05.50");
  assert.equal(formatAssTime(3661.12), "1:01:01.12");
  console.log("✓ formatAssTime verified.\n");

  // -------------------------------------------------------------
  // Test 2: Text Chunking for Subtitles
  // -------------------------------------------------------------
  console.log("Test 2: Text Chunking for Subtitles...");
  const shortText = "Breaking news tonight from Melbourne.";
  const shortChunks = splitTextIntoChunks(shortText, 8);
  assert.equal(shortChunks.length, 1);
  assert.equal(shortChunks[0], shortText);

  const longText =
    "Marco Jansen has climbed to the number one spot in the ICC Test bowling rankings following a historic series win over Australia in Melbourne.";
  const longChunks = splitTextIntoChunks(longText, 6);
  assert.ok(longChunks.length >= 3, `Expected at least 3 chunks, got ${longChunks.length}`);
  console.log("✓ splitTextIntoChunks verified.\n");

  // -------------------------------------------------------------
  // Test 3: Caption Timing Proportionality
  // -------------------------------------------------------------
  console.log("Test 3: Proportional Caption Timing Allocation...");
  const sampleScript: NewsScript = {
    title: "Jansen Reaches Top of ICC Rankings",
    hook: "Marco Jansen is now the world's top-ranked Test bowler.",
    fullScript: "Hook story closing",
    segments: [
      {
        id: "seg_1",
        type: "hook",
        text: "Marco Jansen is now the number one Test bowler in the world.",
        estimatedDurationSeconds: 4,
        claimIds: ["c1"],
      },
      {
        id: "seg_2",
        type: "story",
        text: "The South African all-rounder took eight wickets at the MCG.",
        estimatedDurationSeconds: 4,
        claimIds: ["c2"],
      },
      {
        id: "seg_3",
        type: "closing",
        text: "Stay tuned for more updates.",
        estimatedDurationSeconds: 2,
        claimIds: ["c3"],
      },
    ],
    wordCount: 26,
    estimatedDurationSeconds: 10,
    tone: "professional",
    usedClaimIds: ["c1", "c2", "c3"],
    excludedClaimIds: [],
    generatedAt: new Date().toISOString(),
  };

  const totalAudioDuration = 12.0;
  const captionSegments = generateCaptionSegments(sampleScript, totalAudioDuration);
  assert.ok(captionSegments.length >= 3, "Should produce at least 3 caption segments");
  assert.equal(captionSegments[0].startTimeSeconds, 0, "First segment starts at 0");

  const lastSeg = captionSegments[captionSegments.length - 1];
  assert.ok(
    Math.abs(lastSeg.endTimeSeconds - totalAudioDuration) < 0.05,
    `Final segment end (${lastSeg.endTimeSeconds}) must match audio duration (${totalAudioDuration})`
  );
  console.log("✓ Caption timing proportionality verified.\n");

  // -------------------------------------------------------------
  // Test 4: ASS Subtitle Document Generation
  // -------------------------------------------------------------
  console.log("Test 4: ASS Subtitle Document Generation...");
  const assOutput = generateAssSubtitles(captionSegments, {
    headline: "TEST HEADLINE BANNER",
    sourceDomain: "cricinfo.com",
    totalDurationSeconds: totalAudioDuration,
  });

  assert.ok(assOutput.includes("[Script Info]"), "Contains [Script Info]");
  assert.ok(assOutput.includes("PlayResX: 1920"), "Contains 1920 PlayResX");
  assert.ok(assOutput.includes("PlayResY: 1080"), "Contains 1080 PlayResY");
  assert.ok(assOutput.includes("Style: Headline"), "Defines Headline style");
  assert.ok(assOutput.includes("Style: LowerThird"), "Defines LowerThird style");
  assert.ok(assOutput.includes("Style: Captions"), "Defines Captions style");
  assert.ok(assOutput.includes("TEST HEADLINE BANNER"), "Includes uppercase headline banner");
  assert.ok(assOutput.includes("NEWSAI STUDIO  |  CRICINFO.COM"), "Includes lower third branding");
  console.log("✓ ASS subtitle document generation verified.\n");

  // -------------------------------------------------------------
  // Test 5: FFmpeg Path & Filter Escaping
  // -------------------------------------------------------------
  console.log("Test 5: FFmpeg Path & Filter Escaping...");
  const rawPath = "C:\\Users\\test's folder:sub/file.ass";
  const escaped = escapeFilterPath(rawPath);
  assert.ok(!escaped.includes("\\U"), "Backslashes normalized");
  assert.ok(escaped.includes("\\:"), "Colons escaped");
  assert.ok(escaped.includes("\\'"), "Single quotes escaped");
  console.log("✓ escapeFilterPath verified.\n");

  // -------------------------------------------------------------
  // Test 6: Probe Media Duration on Presenter MP4
  // -------------------------------------------------------------
  console.log("Test 6: Probe Media Duration on public/presenter.mp4...");
  const presenterPath = path.join(process.cwd(), "public", "presenter.mp4");
  assert.ok(fs.existsSync(presenterPath), "public/presenter.mp4 must exist");
  const presenterDuration = await probeMediaDuration(presenterPath);
  console.log(`  Presenter duration: ${presenterDuration.toFixed(2)}s`);
  assert.ok(presenterDuration > 30, `Expected presenter duration > 30s, got ${presenterDuration}`);
  console.log("✓ Media duration probe verified.\n");

  // -------------------------------------------------------------
  // Test 7: Video Store Unit Tests
  // -------------------------------------------------------------
  console.log("Test 7: Video Store...");
  clearVideoStore();
  const dummyFile = path.join(os.tmpdir(), "dummy_video_test.mp4");
  fs.writeFileSync(dummyFile, Buffer.from("dummy video content"));

  const registered = registerVideo(dummyFile, 15.5, 1920, 1080, 5000);
  assert.ok(registered.id.startsWith("vid_"));
  assert.equal(registered.durationSeconds, 15.5);
  assert.equal(registered.width, 1920);
  assert.equal(registered.height, 1080);

  const retrieved = getStoredVideo(registered.id);
  assert.ok(retrieved !== null);
  assert.equal(retrieved?.id, registered.id);

  // Expired pruning test
  pruneExpiredVideos(Date.now() + 10000);
  assert.equal(getStoredVideo(registered.id), null);
  fs.unlinkSync(dummyFile);
  console.log("✓ Video store operations verified.\n");

  // -------------------------------------------------------------
  // Test 8: End-to-end Video Composition (FFmpeg transcode)
  // -------------------------------------------------------------
  console.log("Test 8: Full FFmpeg 1080p Composition Pipeline...");
  clearTemporaryAudioStore();

  // Create a 3-second test AAC audio tone as authoritative narration
  const testAudioPath = path.join(os.tmpdir(), "newsai_test_tone.mp3");
  const ffmpegBin = getFfmpegPath();
  execFileSync(ffmpegBin, [
    "-y",
    "-f", "lavfi",
    "-i", "sine=frequency=440:duration=3",
    "-c:a", "libmp3lame",
    "-b:a", "192k",
    testAudioPath,
  ]);

  const testAudioBuffer = fs.readFileSync(testAudioPath);
  const audioEntry = registerTemporaryAudio(testAudioBuffer, "audio/mpeg");
  console.log(`  Registered temporary narration audio (id: ${audioEntry.id}, size: ${testAudioBuffer.byteLength} bytes)`);

  const compositionResult = await composeVideoService({
    avatarVideoUrl: "/presenter.mp4",
    audioId: audioEntry.id,
    newsScript: sampleScript,
    headline: "JANSEN TOP TEST BOWLER",
    sourceDomain: "cricinfo.com",
  });

  console.log("  Composition Result:", {
    videoId: compositionResult.videoId,
    videoUrl: compositionResult.videoUrl,
    durationSeconds: compositionResult.durationSeconds,
    width: compositionResult.width,
    height: compositionResult.height,
    format: compositionResult.format,
  });

  assert.ok(compositionResult.videoId.startsWith("vid_"));
  assert.equal(compositionResult.width, 1920);
  assert.equal(compositionResult.height, 1080);
  assert.equal(compositionResult.format, "mp4");
  assert.ok(
    Math.abs(compositionResult.durationSeconds - 3.0) < 0.5,
    `Duration should match audio (~3s), got ${compositionResult.durationSeconds}`
  );

  // Verify the stored video exists and inspect stream specs
  const storedEntry = getStoredVideo(compositionResult.videoId);
  assert.ok(storedEntry !== null, "Stored video entry must exist");
  assert.ok(fs.existsSync(storedEntry!.filePath), "Output file must exist on disk");

  const probeOutput = await runFfmpeg(["-i", storedEntry!.filePath, "-f", "null", "-"])
    .then((r) => r.stderr)
    .catch((err) => err.message);
  assert.ok(probeOutput.includes("1920x1080") || probeOutput.includes("Stream #0:0"), "FFmpeg output confirms video stream");

  // Clean up test tone
  if (fs.existsSync(testAudioPath)) {
    fs.unlinkSync(testAudioPath);
  }
  console.log("✓ End-to-end 1080p composition verified.\n");

  // -------------------------------------------------------------
  // Test 9: Input Validation & Error Handling
  // -------------------------------------------------------------
  console.log("Test 9: Input Validation & Error Handling...");
  let failedAsExpected = false;
  try {
    await composeVideoService({
      avatarVideoUrl: "",
      newsScript: sampleScript,
    });
  } catch (err: unknown) {
    failedAsExpected = true;
    console.log(`  Expected error caught: ${(err as Error).message}`);
  }
  assert.ok(failedAsExpected, "Should throw error on empty avatarVideoUrl");

  failedAsExpected = false;
  try {
    await composeVideoService({
      avatarVideoUrl: "/presenter.mp4",
      newsScript: { ...sampleScript, segments: [] },
    });
  } catch (err: unknown) {
    failedAsExpected = true;
    console.log(`  Expected error caught: ${(err as Error).message}`);
  }
  assert.ok(failedAsExpected, "Should throw error on script with no segments");
  console.log("✓ Validation and error handling verified.\n");

  console.log("==================================================");
  console.log("✅ ALL PHASE 7A TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
