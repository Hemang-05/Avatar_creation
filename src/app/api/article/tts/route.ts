import { NextRequest, NextResponse } from "next/server";
import { synthesizeScript } from "@/lib/tts/ttsService";
import { TTSServiceError } from "@/lib/tts/ttsTypes";
import { sanitizeTTSError } from "@/lib/tts/ttsUtils";
import {
  buildTemporaryAudioUrl,
  registerTemporaryAudio,
} from "@/lib/avatar/avatarUtils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_SCRIPT",
            message: "Invalid script",
          },
        },
        { status: 400 }
      );
    }

    const scriptCandidate = (body as Record<string, unknown>).script;
    if (!scriptCandidate || typeof scriptCandidate !== "object") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_SCRIPT",
            message: "Invalid script",
          },
        },
        { status: 400 }
      );
    }

    const result = await synthesizeScript(scriptCandidate);

    // Register the synthesized ElevenLabs MP3 in the ephemeral server-side audio store
    // so Phase 6 (Avatar generation) can reference it without relying on browser blob: URLs
    const tempEntry = registerTemporaryAudio(
      result.audio,
      result.mimeType || "audio/mpeg"
    );
    const serverAudioUrl = buildTemporaryAudioUrl(tempEntry.id);

    return new NextResponse(new Uint8Array(result.audio), {
      status: 200,
      headers: {
        "Content-Type": result.mimeType || "audio/mpeg",
        "Content-Length": String(result.audio.byteLength),
        "Cache-Control": "no-store",
        "X-TTS-Provider": result.provider,
        "X-TTS-Model": result.modelId,
        "X-TTS-Audio-Id": tempEntry.id,
        "X-TTS-Audio-Url": serverAudioUrl,
      },
    });
  } catch (err: unknown) {
    const sanitized: TTSServiceError = sanitizeTTSError(err);
    console.warn(`[TTS API] Error (${sanitized.code}): ${sanitized.message}`);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: sanitized.code,
          message: sanitized.message,
        },
      },
      { status: sanitized.statusCode }
    );
  }
}

