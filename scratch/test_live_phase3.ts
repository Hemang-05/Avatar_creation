import { Article } from "../src/lib/article/articleTypes";
import { researchArticle } from "../src/lib/research/researchAgent";

async function testLivePhase3() {
  console.log("Loading .env.local keys for live test...");
  process.loadEnvFile(".env.local");

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();

  console.log("GEMINI_API_KEY configured:", Boolean(geminiKey), `(length: ${geminiKey?.length})`);
  console.log("TAVILY_API_KEY configured:", Boolean(tavilyKey), `(length: ${tavilyKey?.length})`);

  if (!geminiKey || !tavilyKey) {
    throw new Error("Missing keys in .env.local");
  }

  const liveArticle: Article = {
    url: "https://en.wikipedia.org/wiki/Portal:Current_events",
    title: "Global Current Events and International News Digest",
    description: "Daily roundup of major international political, sports, and economic developments.",
    source: "en.wikipedia.org",
    content: `The 2026 Asian Champions Trophy hockey tournament got underway with defending champions India securing a dominant 13-0 victory over Bangladesh in their opening pool match. Harmanpreet Singh scored twice from set pieces. Meanwhile, diplomatic talks resumed in Geneva regarding global carbon emission standards for commercial shipping.`,
    wordCount: 52,
  };

  console.log("\nCalling live researchArticle() with Gemini 3.5 Flash-Lite and Tavily Search...");
  const startTime = Date.now();

  const result = await researchArticle(liveArticle);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✓ Live Research completed successfully in ${durationSec}s!`);
  console.log("-------------------------------------------------------");
  console.log("Summary:", result.summary);
  console.log("Overall Confidence:", `${Math.round(result.overallConfidence * 100)}%`);
  console.log("Iterations Completed:", result.researchIterations);
  console.log("Web Sources Retrieved:", result.sources.length);
  console.log("Claims Evaluated:", result.claims.length);
  console.log("-------------------------------------------------------");
  console.log("Claims Breakdown:");
  for (const c of result.claims) {
    console.log(`- [${c.status.toUpperCase()}] (${Math.round(c.confidence * 100)}% conf) ${c.claim}`);
    console.log(`  Evidence: ${c.evidence}`);
    if (c.conflict) console.log(`  Conflict: ${c.conflict}`);
    if (c.sourceUrls.length > 0) {
      console.log(`  Sources: ${c.sourceUrls.join(", ")}`);
    }
  }

  if (result.context && result.context.length > 0) {
    console.log("\nAdditional Context Discovered:");
    for (const ctx of result.context) {
      console.log(`- ${ctx}`);
    }
  }

  if (result.sources.length > 0) {
    console.log("\nTop Sources:");
    for (const s of result.sources.slice(0, 3)) {
      console.log(`- [${s.domain}] ${s.title} (${s.url})`);
    }
  }
}

testLivePhase3().catch((err) => {
  console.error("Live test encountered an error:", err);
  process.exit(1);
});

