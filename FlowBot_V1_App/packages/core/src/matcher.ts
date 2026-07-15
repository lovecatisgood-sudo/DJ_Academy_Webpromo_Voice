import type { Language } from "@flowbot/shared";
import { canSubstringMatch, normalizeInput } from "./normalize";

export type KeywordCandidate = {
  nodeId: string;
  keyword: string;
  lang: Language;
  priority: number;
  substringEnabled: boolean;
  order: number;
};

export type KeywordMatch =
  | {
      kind: "match";
      nodeId: string;
      keyword: string;
      tier: "exact" | "contains";
    }
  | {
      kind: "suggestions";
      nodeIds: string[];
    }
  | {
      kind: "none";
    };

export function matchKeyword(input: string, lang: Language, candidates: KeywordCandidate[]): KeywordMatch {
  const normalizedInput = normalizeInput(input);
  const ranked = candidates
    .filter((candidate) => candidate.lang === lang)
    .map((candidate) => {
      const keyword = normalizeInput(candidate.keyword);
      const exact = normalizedInput === keyword;
      const contains =
        candidate.substringEnabled &&
        canSubstringMatch(keyword, lang) &&
        normalizedInput.includes(keyword);

      if (!exact && !contains) return null;

      return {
        candidate,
        keyword,
        tier: exact ? "exact" as const : "contains" as const,
        tierRank: exact ? 0 : 1
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => {
      if (a.tierRank !== b.tierRank) return a.tierRank - b.tierRank;
      if (a.keyword.length !== b.keyword.length) return b.keyword.length - a.keyword.length;
      if (a.candidate.priority !== b.candidate.priority) return a.candidate.priority - b.candidate.priority;
      return a.candidate.order - b.candidate.order;
    });

  if (ranked.length === 0) return { kind: "none" };

  const first = ranked[0]!;
  const tied = ranked.filter(
    (item) =>
      item.tierRank === first.tierRank &&
      item.keyword.length === first.keyword.length &&
      item.candidate.priority === first.candidate.priority
  );

  if (tied.length > 1) {
    return { kind: "suggestions", nodeIds: tied.slice(0, 3).map((item) => item.candidate.nodeId) };
  }

  return {
    kind: "match",
    nodeId: first.candidate.nodeId,
    keyword: first.candidate.keyword,
    tier: first.tier
  };
}
