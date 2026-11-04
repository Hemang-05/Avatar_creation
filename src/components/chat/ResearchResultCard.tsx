"use client";

import React, { useState } from "react";
import { ClaimVerificationStatus, ResearchClaim, ResearchResult } from "@/types/research";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  HelpCircle,
  XCircle,
  Search,
  Sparkles,
  Globe,
  ChevronDown,
  ChevronUp,
  Layers,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ResearchResultCardProps {
  research: ResearchResult;
  articleTitle?: string;
  className?: string;
}

function getClaimBadgeConfig(status: ClaimVerificationStatus) {
  switch (status) {
    case "verified":
      return {
        label: "Verified",
        icon: CheckCircle2,
        badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
        borderClass: "border-emerald-500/20 bg-emerald-950/10",
      };
    case "partially_verified":
      return {
        label: "Partially Verified",
        icon: ShieldQuestion,
        badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        borderClass: "border-amber-500/20 bg-amber-950/10",
      };
    case "contradicted":
      return {
        label: "Contradicted",
        icon: XCircle,
        badgeClass: "bg-red-500/15 text-red-400 border-red-500/30",
        borderClass: "border-red-500/30 bg-red-950/15",
      };
    case "unverified":
    default:
      return {
        label: "Unverified",
        icon: HelpCircle,
        badgeClass: "bg-zinc-500/15 text-zinc-400 border-zinc-600/30",
        borderClass: "border-zinc-800/80 bg-zinc-950/30",
      };
  }
}

function ClaimRow({ claim }: { claim: ResearchClaim }) {
  const config = getClaimBadgeConfig(claim.status);
  const Icon = config.icon;
  const confidencePct = Math.round(claim.confidence * 100);

  return (
    <div
      className={cn(
        "rounded-xl border p-3.5 transition-all space-y-2",
        config.borderClass
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs sm:text-sm font-medium text-zinc-100 leading-snug flex-1">
          {claim.claim}
        </p>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium border",
              config.badgeClass
            )}
          >
            <Icon className="w-3 h-3" />
            <span>{config.label}</span>
          </span>

          <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-zinc-900 text-zinc-300 border border-zinc-800">
            {confidencePct}% conf
          </span>
        </div>
      </div>

      {/* Evidence explanation */}
      <p className="text-xs text-zinc-300 leading-relaxed">{claim.evidence}</p>

      {/* Conflict Alert if present */}
      {claim.conflict && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-200">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-red-300">Conflicting Evidence: </span>
            <span>{claim.conflict}</span>
          </div>
        </div>
      )}

      {/* Supporting Source URLs */}
      {claim.sourceUrls && claim.sourceUrls.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
            Sources:
          </span>
          {claim.sourceUrls.map((url, idx) => {
            let domain = url;
            try {
              domain = new URL(url).hostname.replace(/^www\./, "");
            } catch {
              // keep raw string
            }
            return (
              <a
                key={`${url}-${idx}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-900/90 hover:bg-zinc-800 text-[11px] font-mono text-blue-400 hover:text-blue-300 border border-zinc-800 transition-colors"
              >
                <span>{domain}</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ResearchResultCard({
  research,
  articleTitle,
  className,
}: ResearchResultCardProps) {
  const [showAllSources, setShowAllSources] = useState(false);

  const displayTitle = articleTitle || research.articleTitle || "Extracted News Story";
  const overallConfidencePct = Math.round(research.overallConfidence * 100);

  const verifiedClaims = research.claims.filter((c) => c.status === "verified");
  const partiallyVerifiedClaims = research.claims.filter(
    (c) => c.status === "partially_verified"
  );
  const contradictedClaims = research.claims.filter((c) => c.status === "contradicted");
  const unverifiedClaims = research.claims.filter((c) => c.status === "unverified");
  const unresolvedOrContradictedClaims = [
    ...contradictedClaims,
    ...partiallyVerifiedClaims,
    ...unverifiedClaims,
  ];

  const hasContradictions = contradictedClaims.length > 0;
  const visibleSources = showAllSources
    ? research.sources
    : research.sources.slice(0, 4);

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-zinc-900/80 p-4 sm:p-5 backdrop-blur-md shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4",
        className
      )}
    >
      {/* Top Header Bar: Status & Overall Confidence */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center border",
              hasContradictions
                ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                : "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
            )}
          >
            {hasContradictions ? (
              <ShieldAlert className="w-4 h-4" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs sm:text-sm font-semibold tracking-tight text-white">
                Research Complete
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {research.researchIterations}{" "}
                {research.researchIterations === 1 ? "iteration" : "iterations"}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Verified with Gemini 3.5 Flash-Lite & Tavily Web Search
            </p>
          </div>
        </div>

        {/* Confidence Pill */}
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "px-3 py-1 rounded-full text-xs font-mono font-semibold border flex items-center gap-1.5",
              overallConfidencePct >= 75
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                : overallConfidencePct >= 45
                ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
                : "bg-zinc-800 text-zinc-300 border-zinc-700"
            )}
          >
            <Sparkles className="w-3 h-3" />
            <span>Confidence: {overallConfidencePct}%</span>
          </div>
        </div>
      </div>

      {/* Article Title & Research Summary */}
      <div className="space-y-2">
        <div className="text-xs font-mono uppercase tracking-wider text-zinc-400">
          Researched Article
        </div>
        <h3 className="text-sm sm:text-base font-semibold text-zinc-100 leading-snug">
          {displayTitle}
        </h3>
        <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs sm:text-sm text-zinc-200 leading-relaxed">
          {research.summary}
        </div>
      </div>

      {/* Metrics Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-xl bg-zinc-950/50 border border-zinc-800/70 p-2.5">
          <div className="text-[11px] text-zinc-400 font-mono">Total Claims</div>
          <div className="text-base sm:text-lg font-semibold text-white mt-0.5">
            {research.claims.length}
          </div>
        </div>

        <div className="rounded-xl bg-emerald-950/20 border border-emerald-500/20 p-2.5">
          <div className="text-[11px] text-emerald-400/90 font-mono">Verified Claims</div>
          <div className="text-base sm:text-lg font-semibold text-emerald-400 mt-0.5">
            {verifiedClaims.length}
          </div>
        </div>

        <div className="rounded-xl bg-amber-950/20 border border-amber-500/20 p-2.5">
          <div className="text-[11px] text-amber-400/90 font-mono">
            Unresolved / Contradicted
          </div>
          <div className="text-base sm:text-lg font-semibold text-amber-400 mt-0.5">
            {unresolvedOrContradictedClaims.length}
          </div>
        </div>

        <div className="rounded-xl bg-blue-950/20 border border-blue-500/20 p-2.5">
          <div className="text-[11px] text-blue-400/90 font-mono">Web Sources</div>
          <div className="text-base sm:text-lg font-semibold text-blue-400 mt-0.5">
            {research.sources.length}
          </div>
        </div>
      </div>

      {/* Verified Claims Section */}
      {verifiedClaims.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 uppercase tracking-wider font-mono">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Independently Verified Claims ({verifiedClaims.length})</span>
          </div>
          <div className="space-y-2">
            {verifiedClaims.map((claim, idx) => (
              <ClaimRow key={`verified-${idx}`} claim={claim} />
            ))}
          </div>
        </div>
      )}

      {/* Unresolved / Partially Verified / Contradicted Claims Section */}
      {unresolvedOrContradictedClaims.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 uppercase tracking-wider font-mono">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>
              Unresolved / Partially Verified / Contradicted (
              {unresolvedOrContradictedClaims.length})
            </span>
          </div>
          <div className="space-y-2">
            {unresolvedOrContradictedClaims.map((claim, idx) => (
              <ClaimRow key={`unresolved-${idx}`} claim={claim} />
            ))}
          </div>
        </div>
      )}

      {/* Additional Context & Key Entities */}
      {((research.context && research.context.length > 0) ||
        research.keyEntities.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {research.context && research.context.length > 0 && (
            <div className="rounded-xl bg-zinc-950/40 border border-zinc-800/70 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-blue-400 uppercase">
                <Layers className="w-3.5 h-3.5" />
                <span>Additional Context Discovered</span>
              </div>
              <ul className="space-y-1.5 text-xs text-zinc-300 list-disc list-inside leading-relaxed">
                {research.context.map((ctx, idx) => (
                  <li key={idx}>{ctx}</li>
                ))}
              </ul>
            </div>
          )}

          {research.keyEntities.length > 0 && (
            <div className="rounded-xl bg-zinc-950/40 border border-zinc-800/70 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-zinc-300 uppercase">
                <Tag className="w-3.5 h-3.5 text-zinc-400" />
                <span>Key Entities</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {research.keyEntities.map((entity, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs text-zinc-300"
                  >
                    {entity}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tavily Web Sources List */}
      <div className="pt-2 border-t border-zinc-800/80 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-zinc-300 uppercase">
            <Search className="w-3.5 h-3.5 text-blue-400" />
            <span>Retrieved Web Sources ({research.sources.length})</span>
          </div>
        </div>

        {research.sources.length === 0 ? (
          <p className="text-xs text-zinc-500 italic">
            No external web sources were returned during verification.
          </p>
        ) : (
          <div className="space-y-2">
            {visibleSources.map((source, idx) => (
              <a
                key={`${source.url}-${idx}`}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl bg-zinc-950/50 hover:bg-zinc-900 border border-zinc-800/70 hover:border-zinc-700 p-3 transition-all group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200 group-hover:text-blue-400 transition-colors line-clamp-1">
                    <Globe className="w-3.5 h-3.5 text-zinc-500 group-hover:text-blue-400 flex-shrink-0" />
                    <span>{source.title}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 flex-shrink-0">
                    <span>{source.domain}</span>
                    <ExternalLink className="w-3 h-3" />
                  </div>
                </div>
                {source.snippet && (
                  <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                    {source.snippet}
                  </p>
                )}
              </a>
            ))}

            {research.sources.length > 4 && (
              <button
                onClick={() => setShowAllSources(!showAllSources)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors py-1 cursor-pointer"
              >
                {showAllSources ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Show fewer sources</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Show all {research.sources.length} sources</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

