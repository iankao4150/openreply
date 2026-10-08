import { prisma } from "@/lib/db/client";

export interface ContactTouch {
  workspaceId: string;
  /** InstagramAccount.id (our row), not the Instagram id. */
  instagramAccountId: string;
  userId: string;
  username?: string | null;
  /** "inbound" opens Instagram's 24-hour messaging window; a comment does not. */
  kind: "comment" | "inbound";
}

const MAX_TAGS = 30;
export const TAG_MAX_LENGTH = 30;

/** Trimmed, de-duplicated tags (case-insensitive), capped in count and length. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().slice(0, TAG_MAX_LENGTH);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

async function upsertContact(touch: ContactTouch, now: Date): Promise<void> {
  const at = touch.kind === "inbound" ? { lastInboundAt: now } : { lastCommentAt: now };
  const username = touch.username?.trim() || undefined;
  const update = { lastSeenAt: now, interactions: { increment: 1 }, ...at, ...(username ? { username } : {}) };
  const where = { instagramAccountId_userId: { instagramAccountId: touch.instagramAccountId, userId: touch.userId } };
  try {
    await prisma.contact.upsert({
      where,
      create: {
        workspaceId: touch.workspaceId,
        instagramAccountId: touch.instagramAccountId,
        userId: touch.userId,
        username: username ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
        ...at,
      },
      update,
    });
  } catch (error) {
    // Two webhooks for a new person can race on the create; the row exists now.
    if ((error as { code?: string })?.code !== "P2002") throw error;
    await prisma.contact.update({ where, data: update });
  }
}

/**
 * Remember who interacted. Best effort: a failure is logged and never blocks
 * the reply itself.
 */
export async function recordContacts(touches: ContactTouch[], now = new Date()): Promise<void> {
  const unique = new Map<string, ContactTouch>();
  for (const touch of touches) {
    if (!touch.userId) continue;
    const key = `${touch.instagramAccountId}:${touch.userId}:${touch.kind}`;
    const prior = unique.get(key);
    unique.set(key, { ...touch, username: touch.username ?? prior?.username ?? null });
  }
  for (const touch of unique.values()) {
    try {
      await upsertContact(touch, now);
    } catch (error) {
      console.warn("[Contacts] Not recorded:", error instanceof Error ? error.message : String(error));
    }
  }
}

/**
 * Add a campaign's tags to the person it just answered. Best effort, like
 * recordContacts.
 */
export async function tagContact(
  automation: { workspaceId: string; instagramAccountId: string; addTags?: string[] | null },
  userId: string,
  username?: string | null
): Promise<void> {
  const tags = normalizeTags(automation.addTags ?? []);
  if (!tags.length || !userId) return;
  try {
    const where = {
      instagramAccountId_userId: { instagramAccountId: automation.instagramAccountId, userId },
    };
    const existing = await prisma.contact.findUnique({ where, select: { tags: true } });
    if (!existing) {
      await prisma.contact.create({
        data: {
          workspaceId: automation.workspaceId,
          instagramAccountId: automation.instagramAccountId,
          userId,
          username: username ?? null,
          tags,
        },
      });
      return;
    }
    const merged = normalizeTags([...existing.tags, ...tags]);
    if (merged.length === existing.tags.length) return;
    await prisma.contact.update({ where, data: { tags: merged } });
  } catch (error) {
    console.warn("[Contacts] Tags not added:", error instanceof Error ? error.message : String(error));
  }
}
