import { foldDiacritics, normalizeArabicScript, stripSpecialCharacters } from "@/lib/utils/keyword-matcher";

export interface ConflictCandidate {
  id: string;
  name: string;
  instagramAccountId: string;
  isActive: boolean;
  dmOnly: boolean;
  dmRuleType: string;
  postId: string | null;
  matchAnyPost: boolean;
  matchAnyWord: boolean;
  keywords: string[];
  dmTriggerEnabled: boolean;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  hoursMode?: string;
}

export interface CampaignConflict {
  otherId: string;
  otherName: string;
  /**
   * "comment": both answer the same comments; "dm": both answer the same DMs;
   * "story": two rules answer story mentions (only the oldest is used);
   * "default": two default replies (only the oldest is used).
   */
  kind: "comment" | "dm" | "story" | "default";
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
  return c.dmOnly ? c.dmRuleType === "KEYWORD" : c.dmTriggerEnabled;
}

const isStoryRule = (c: ConflictCandidate) => c.dmOnly && c.dmRuleType === "STORY_MENTION";
const isDefaultRule = (c: ConflictCandidate) => c.dmOnly && c.dmRuleType === "DEFAULT";

const time = (value: Date | string | null | undefined) => (value ? new Date(value).getTime() : null);

/** Whether the two can be live at the same moment (schedule and business hours). */
function liveTogether(a: ConflictCandidate, b: ConflictCandidate) {
  const [aStart, aEnd, bStart, bEnd] = [time(a.startsAt), time(a.endsAt), time(b.startsAt), time(b.endsAt)];
  if (aEnd !== null && bStart !== null && aEnd <= bStart) return false;
  if (bEnd !== null && aStart !== null && bEnd <= aStart) return false;
  const modes = new Set([a.hoursMode ?? "ALWAYS", b.hoursMode ?? "ALWAYS"]);
  return !(modes.has("OPEN") && modes.has("CLOSED"));
}

function postsOverlap(a: ConflictCandidate, b: ConflictCandidate) {
  return a.matchAnyPost || b.matchAnyPost || (Boolean(a.postId) && a.postId === b.postId);
}

/**
 * Active campaigns that would answer the same comment or DM as `target`.
 * Instagram allows one private reply per comment, and a DM gets one reply, so
 * only the oldest matching campaign answers and the others never do — almost
 * never what was intended.
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
    if (!liveTogether(target, other)) continue;
    if (isDefaultRule(target) || isDefaultRule(other)) {
      if (isDefaultRule(target) && isDefaultRule(other)) {
        conflicts.push({ otherId: other.id, otherName: other.name, kind: "default" });
      }
      continue;
    }
    if (isStoryRule(target) && isStoryRule(other)) {
      conflicts.push({ otherId: other.id, otherName: other.name, kind: "story" });
      continue;
    }
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
  dmRuleType: true,
  postId: true,
  matchAnyPost: true,
  matchAnyWord: true,
  keywords: true,
  dmTriggerEnabled: true,
  startsAt: true,
  endsAt: true,
  hoursMode: true,
} as const;
