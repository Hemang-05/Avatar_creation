import type { NewsScript } from "@/lib/script/scriptTypes";
import type { CaptionSegment } from "./videoTypes";

export function formatAssTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const cs = Math.floor(Math.round((clamped % 1) * 100));
  const finalCs = cs >= 100 ? 99 : cs;

  return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(finalCs).padStart(2, "0")}`;
}

export function splitTextIntoChunks(text: string, maxWordsPerChunk = 9): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWordsPerChunk) {
    return [text.trim()];
  }

  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWordsPerChunk) {
    chunks.push(words.slice(i, i + maxWordsPerChunk).join(" "));
  }
  return chunks;
}

/**
 * Calculates proportional timing for script segments based on word counts
 * and splits long segments into readable subtitle chunks.
 */
export function generateCaptionSegments(
  script: NewsScript,
  totalAudioDuration: number
): CaptionSegment[] {
  if (!script.segments || script.segments.length === 0) {
    return [];
  }

  // Calculate word count for each segment
  const segmentWordCounts = script.segments.map((s) => {
    const count = s.text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, count);
  });

  const totalWords = segmentWordCounts.reduce((acc, count) => acc + count, 0);
  const captionSegments: CaptionSegment[] = [];

  let currentTime = 0;

  for (let i = 0; i < script.segments.length; i++) {
    const segment = script.segments[i];
    const segmentDuration = (segmentWordCounts[i] / totalWords) * totalAudioDuration;
    const segmentStart = currentTime;
    const segmentEnd = i === script.segments.length - 1 ? totalAudioDuration : currentTime + segmentDuration;
    currentTime = segmentEnd;

    // Split long segment text into bite-sized phrases (max 8-10 words) for readability
    const chunks = splitTextIntoChunks(segment.text, 9);
    const chunkDuration = (segmentEnd - segmentStart) / chunks.length;

    chunks.forEach((chunk, chunkIdx) => {
      const chunkStart = segmentStart + chunkIdx * chunkDuration;
      const chunkEnd = chunkIdx === chunks.length - 1 ? segmentEnd : chunkStart + chunkDuration;

      captionSegments.push({
        speaker: "Presenter",
        text: chunk,
        startTimeSeconds: chunkStart,
        endTimeSeconds: chunkEnd,
      });
    });
  }

  return captionSegments;
}

export interface AssSubtitleOptions {
  headline?: string;
  sourceDomain?: string;
  totalDurationSeconds: number;
}

/**
 * Generates an Advanced SubStation Alpha (.ass) subtitle file content
 * containing Headline, Lower-Third, and Narrated Captions.
 */
export function generateAssSubtitles(
  segments: CaptionSegment[],
  options: AssSubtitleOptions
): string {
  const { headline = "", sourceDomain = "NewsAI Studio", totalDurationSeconds } = options;

  // Clean strings for ASS
  const cleanHeadline = headline.replace(/[{}]/g, "").replace(/\r?\n/g, " ").trim();
  const cleanSource = sourceDomain.replace(/[{}]/g, "").replace(/\r?\n/g, " ").trim();
  const totalDurationStr = formatAssTime(totalDurationSeconds);

  // ASS Script Definition
  // Alignment: 8 = top-center, 1 = bottom-left, 2 = bottom-center
  // Colors: &HAABBGGRR& (Alpha, Blue, Green, Red)
  // BorderStyle 1 = Outline + drop shadow, 3 = Opaque box backing
  const header = `[Script Info]
Title: NewsAI Studio Composition
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Headline,Arial,38,&H00FFFFFF&,&H00000000&,&H00000000&,&H50000000&,1,0,0,0,100,100,1,0,3,4,0,8,60,60,40,1
Style: LowerThird,Arial,28,&H00FFFFFF&,&H00000000&,&H00000000&,&H400A0A14&,1,0,0,0,100,100,0,0,3,8,0,1,50,50,45,1
Style: Captions,Arial,42,&H00FFFFFF&,&H00000000&,&H00000000&,&H70000000&,1,0,0,0,100,100,0,0,3,6,0,2,80,80,135,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const dialogueLines: string[] = [];

  // 1. Persistent Top Headline Banner (if present)
  if (cleanHeadline) {
    // Truncate if excessively long for single line or let ASS wrap
    const displayHeadline = cleanHeadline.length > 85 ? cleanHeadline.slice(0, 82) + "..." : cleanHeadline;
    dialogueLines.push(
      `Dialogue: 0,0:00:00.00,${totalDurationStr},Headline,,0,0,0,,${displayHeadline.toUpperCase()}`
    );
  }

  // 2. Persistent Lower-Third Branding (bottom-left)
  const lowerThirdLabel = cleanSource
    ? `NEWSAI STUDIO  |  ${cleanSource.toUpperCase()}`
    : "NEWSAI STUDIO";
  dialogueLines.push(
    `Dialogue: 0,0:00:00.00,${totalDurationStr},LowerThird,,0,0,0,,${lowerThirdLabel}`
  );

  // 3. Proportional Synchronized Captions
  for (const seg of segments) {
    const startStr = formatAssTime(seg.startTimeSeconds);
    const endStr = formatAssTime(seg.endTimeSeconds);
    const textClean = seg.text.replace(/[{}]/g, "").replace(/\r?\n/g, " ").trim();
    if (textClean) {
      dialogueLines.push(
        `Dialogue: 1,${startStr},${endStr},Captions,,0,0,0,,${textClean}`
      );
    }
  }

  return header + dialogueLines.join("\n") + "\n";
}
