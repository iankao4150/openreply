import { foldDiacritics, normalizeArabicScript, stripSpecialCharacters } from "@/lib/utils/keyword-matcher";

export interface ConflictCandidate {
  id: string;
  name: string;
  instagramAccountId: string;
  isActive: boolean;
  dmOnly: boolean;
  postId: string | null;
  matchAnyPost: boolean;
  matchAnyWord: boolean;
  keywords: string[];
  dmTriggerEnabled: boolean;
}

export interface CampaignConflict {
  otherId: string;
  otherName: string;
  /** "comment": both answer the same comments; "dm": both answer the same DMs. */
  kind: "comment" | "dm";
}

function normalize(keyword: string): string {
  return foldDiacritics(stripSpecialCharacters(normalizeArabicScript(keyword))).toLowerCase();
}

/**
 * Two keyword lists can fire on the same text when either matches anything, or
 * when one keyword contains another ("梅西" and "梅西卡": a comment saying
 * 梅西卡 hits both).
 */
function keywordsOverlap(a: ConflictCandidate, b: ConflictCandidate): boolean {
  if (a.matchAnyWord || b.matchAnyWord) return true;
  const left = a.keywords.map(normalize).filter(Boolean);
  const right = b.keywords.map(normalize).filter(Boolean);
  return left.some((x) => right.some((y) => x.includes(y) || y.includes(x)));
}

function answersComments(c: ConflictCandidate) {
  return !c.dmOnly && (c.matchAnyPost || Boolean(c.postId));
}

function answersDms(c: ConflictCandidate) {
  return c.dmOnly || c.dmTriggerEnabled;
}

function postsOverlap(a: ConflictCandidate, b: ConflictCandidate) {
  return a.matchAnyPost || b.matchAnyPost || (Boolean(a.postId) && a.postId === b.postId);
}

/**
 * Active campaigns that would answer the same comment or DM as `target`.
 * Instagram allows one private reply per comment, so on a comment only the
 * oldest campaign's DM goes out; on a DM every match sends, and the person
 * gets several messages. Either way it is almost never intended.
 */
export function findConflicts(
  target: ConflictCandidate,
  others: ConflictCandidate[]
): CampaignConflict[] {
  if (!target.isActive) return [];
  const conflicts: CampaignConflict[] = [];
  for (const other of others) {
    if (other.id === target.id || !other.isActive) continue;
    if (other.instagramAccountId !== target.instagramAccountId) continue;
    if (!keywordsOverlap(target, other)) continue;
    if (answersComments(target) && answersComments(other) && postsOverlap(target, other)) {
      conflicts.push({ otherId: other.id, otherName: other.name, kind: "comment" });
    }
    if (answersDms(target) && answersDms(other)) {
      conflicts.push({ otherId: other.id, otherName: other.name, kind: "dm" });
    }
  }
  return conflicts;
}

export const CONFLICT_CANDIDATE_SELECT = {
  id: true,
  name: true,
  instagramAccountId: true,
  isActive: true,
  dmOnly: true,
  postId: true,
  matchAnyPost: true,
  matchAnyWord: true,
  keywords: true,
  dmTriggerEnabled: true,
} as const;
