import { randomInt } from "node:crypto";
import { matchKeywords } from "@/lib/utils/keyword-matcher";

export interface GiveawayRules {
  winners: number;
  /** Only comments containing this (any case); empty means every comment. */
  keyword: string | null;
  /** Distinct @accounts the comment must tag (e.g. "tag 2 friends"). */
  minMentions: number;
  /** One entry per person, however many times they commented. */
  uniquePerUser: boolean;
  excludeUsernames: string[];
}

export interface GiveawayComment {
  id: string;
  text?: string;
  timestamp?: string;
  from?: { id?: string; username?: string };
}

export interface GiveawayEntry {
  commentId: string;
  userId: string | null;
  username: string;
  text: string;
}

const MENTION = /@([A-Za-z0-9._]{1,30})/g;
const clean = (username: string) => username.trim().replace(/^@/, "").toLowerCase();

export function countMentions(text: string, ownUsername: string): number {
  const own = clean(ownUsername);
  const tagged = new Set<string>();
  for (const match of text.matchAll(MENTION)) {
    const name = match[1].toLowerCase().replace(/\.+$/, "");
    if (name && name !== own) tagged.add(name);
  }
  return tagged.size;
}

/** The comments that may win, in the order Instagram returned them. */
export function eligibleEntries(
  comments: GiveawayComment[],
  rules: GiveawayRules,
  account: { instagramId: string; username: string }
): GiveawayEntry[] {
  const excluded = new Set(rules.excludeUsernames.map(clean).filter(Boolean));
  const own = clean(account.username);
  const seen = new Set<string>();
  const entries: GiveawayEntry[] = [];
  for (const comment of comments) {
    const username = comment.from?.username;
    if (!username) continue;
    const who = clean(username);
    if (who === own || comment.from?.id === account.instagramId || excluded.has(who)) continue;
    const text = comment.text ?? "";
    if (rules.keyword?.trim() && !matchKeywords(text, [rules.keyword.trim()], false).matched) continue;
    if (countMentions(text, account.username) < rules.minMentions) continue;
    if (rules.uniquePerUser) {
      if (seen.has(who)) continue;
      seen.add(who);
    }
    entries.push({ commentId: comment.id, userId: comment.from?.id ?? null, username, text: text.slice(0, 300) });
  }
  return entries;
}

/**
 * Pick winners uniformly at random (crypto-grade) without repeats. When
 * entries are not unique per person, someone with several comments may still
 * win only once.
 */
export function pickWinners(entries: GiveawayEntry[], count: number, random = randomInt): GiveawayEntry[] {
  const pool = [...entries];
  const winners: GiveawayEntry[] = [];
  const won = new Set<string>();
  while (winners.length < count && pool.length > 0) {
    const index = random(pool.length);
    const [entry] = pool.splice(index, 1);
    const who = clean(entry.username);
    if (won.has(who)) continue;
    won.add(who);
    winners.push(entry);
  }
  return winners;
}
