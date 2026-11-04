import { extractArticle } from "../src/lib/article/extractArticle";
import { researchArticle } from "../src/lib/research/researchAgent";
import { generateScript } from "../src/lib/script/scriptGenerator";

async function testLiveCricinfo() {
  process.loadEnvFile(".env.local");
  const url = "https://www.cricinfo.com/story/icc-rankings-marco-jansen-becomes-top-test-bowler-and-abhishek-takes-back-crown-for-t20i-batters-1560404";

  console.log("1. Extracting article from:", url);
  const extractRes = await extractArticle(url);
  if (!extractRes.success) {
    throw new Error(`Extraction failed: ${extractRes.error.message}`);
  }
  console.log(`✓ Article extracted: "${extractRes.article.title}" (${extractRes.article.wordCount} words)`);

  console.log("\n2. Researching story with Gemini 3.5 Flash-Lite + Tavily...");
  const research = await researchArticle(extractRes.article);
  console.log(`✓ Research complete: ${research.claims.length} claims, ${research.sources.length} sources, confidence: ${Math.round(research.overallConfidence * 100)}%`);
  for (const c of research.claims) {
    console.log(`  - [${c.status.toUpperCase()}] ${c.claim}`);
  }

  console.log("\n3. Generating presenter script with Gemini 3.5 Flash-Lite...");
  const script = await generateScript(research);
  console.log(`✓ Script generated: "${script.title}" (${script.wordCount} words, ~${script.estimatedDurationSeconds}s)`);
  console.log("\nPresenter Spoken Script:\n", script.fullScript);
}

testLiveCricinfo().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});

