import { generateScript } from "../src/lib/script/scriptGenerator";
import { ResearchResult } from "../src/types/research";

async function testLivePhase4() {
  console.log("Loading .env.local keys for live Phase 4 test...");
  process.loadEnvFile(".env.local");

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  console.log("GEMINI_API_KEY present:", Boolean(geminiKey));

  if (!geminiKey) {
    throw new Error("Missing GEMINI_API_KEY in .env.local");
  }

  const sampleResearch: ResearchResult = {
    articleUrl: "https://en.wikipedia.org/wiki/Portal:Current_events",
    articleTitle: "Asian Champions Trophy 2026: India Dominates Bangladesh 13-0",
    summary:
      "Defending champions India secured a dominant 13-0 victory against Bangladesh in the opening match of the Asian Champions Trophy in Punjab. Harmanpreet Singh scored twice from set pieces. A separate claim that diplomat talks resumed in Geneva was contradicted by official UN records.",
    claims: [
      {
        id: "claim_1",
        claim: "India defeated Bangladesh 13-0 in their opening match of the Asian Champions Trophy in Punjab.",
        status: "verified",
        confidence: 1.0,
        evidence: "Confirmed by official FIH match records and international wire reports.",
        sourceUrls: ["https://tms.fih.ch/matches/23226"],
      },
      {
        id: "claim_2",
        claim: "Harmanpreet Singh scored two goals from set pieces during the match.",
        status: "verified",
        confidence: 0.95,
        evidence: "Official tournament logs record goals in the 2nd and 44th minutes from penalty corners.",
        sourceUrls: ["https://tms.fih.ch/matches/23226"],
      },
      {
        id: "claim_3",
        claim: "Diplomatic talks resumed in Geneva regarding shipping emissions.",
        status: "contradicted",
        confidence: 0.9,
        evidence: "Official UN and IMO records show meetings occur in London, not Geneva, and were adjourned.",
        sourceUrls: ["https://news.un.org/en/story/2025/10/1166131"],
        conflict: "Talks are centered at the IMO in London, not Geneva.",
      },
      {
        id: "claim_4",
        claim: "An unofficial rumor suggested the match was played in heavy rain.",
        status: "unverified",
        confidence: 0.1,
        evidence: "No weather reports or match logs confirmed rain during play.",
        sourceUrls: [],
      },
    ],
    keyEntities: ["India", "Bangladesh", "Harmanpreet Singh", "Asian Champions Trophy"],
    context: ["India leads Pool A on goal difference after round one."],
    timeline: [{ date: "2026-10-28", event: "Asian Champions Trophy opening fixture" }],
    sources: [
      {
        title: "FIH TMS Match Report",
        url: "https://tms.fih.ch/matches/23226",
        domain: "tms.fih.ch",
      },
    ],
    overallConfidence: 0.74,
    researchIterations: 1,
    researchedAt: new Date().toISOString(),
  };

  console.log("Calling live generateScript() with Gemini 3.5 Flash-Lite...");
  const start = Date.now();
  const script = await generateScript(sampleResearch);
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  console.log(`\n✓ Live script generated in ${elapsed}s!`);
  console.log("-----------------------------------------------------------------");
  console.log("Title:", script.title);
  console.log("Tone:", script.tone);
  console.log("Word Count:", script.wordCount);
  console.log("Estimated Airtime:", `~${script.estimatedDurationSeconds}s`);
  console.log("Used Claims:", script.usedClaimIds);
  console.log("Excluded Claims:", script.excludedClaimIds);
  console.log("-----------------------------------------------------------------");
  console.log("Spoken Script:\n");
  console.log(script.fullScript);
  console.log("-----------------------------------------------------------------");
  console.log("Segments Breakdown:");
  for (const s of script.segments) {
    console.log(`[${s.type.toUpperCase()}] (~${s.estimatedDurationSeconds}s, cites: ${s.claimIds.join(", ") || "none"}):`);
    console.log(`  "${s.text}"`);
  }
}

testLivePhase4().catch((err) => {
  console.error("Live Phase 4 test failed:", err);
  process.exit(1);
});

