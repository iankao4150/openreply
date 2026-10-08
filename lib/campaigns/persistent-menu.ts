import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { decryptToken } from "@/lib/meta/oauth";
import { deleteInstagramPersistentMenu, setInstagramPersistentMenu } from "@/lib/meta/client";
import { moduleActionPayload } from "@/lib/modules/schema";

// Instagram recommends at most five items; titles follow Messenger's 30.
export const MAX_MENU_ITEMS = 5;
export const MENU_TITLE_MAX = 30;

export const menuItemSchema = z
  .object({
    title: z.string().trim().min(1).max(MENU_TITLE_MAX),
    url: z
      .union([z.string().trim().url().refine((u) => /^https:\/\//i.test(u)), z.literal(""), z.null()])
      .optional()
      .transform((value) => value || null),
    moduleId: z
      .string()
      .trim()
      .regex(/^[a-z0-9]{10,40}$/i)
      .optional()
      .nullable()
      .transform((value) => value || null),
  })
  .refine((item) => Boolean(item.url) !== Boolean(item.moduleId), {
    message: "A menu item opens a link or sends a module",
  });

export const menuSchema = z.array(menuItemSchema).max(MAX_MENU_ITEMS);
export type MenuItem = z.infer<typeof menuItemSchema>;

export function parseStoredMenu(value: unknown): MenuItem[] {
  const parsed = menuSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** Publish the account's menu to Instagram, or clear it. Returns an error message or null. */
export async function syncPersistentMenu(instagramAccountDbId: string): Promise<string | null> {
  const account = await prisma.instagramAccount.findUnique({
    where: { id: instagramAccountDbId },
    select: { workspaceId: true, provider: true, accessToken: true, persistentMenu: true },
  });
  if (!account || account.provider !== "META" || !account.accessToken) return null;
  const items = parseStoredMenu(account.persistentMenu);
  try {
    const token = decryptToken(account.accessToken);
    if (items.length === 0) await deleteInstagramPersistentMenu(token);
    else
      await setInstagramPersistentMenu(
        token,
        items.map((item) =>
          item.url
            ? { type: "web_url" as const, title: item.title, url: item.url }
            : { type: "postback" as const, title: item.title, payload: moduleActionPayload(item.moduleId as string, undefined) }
        )
      );
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.operationalEvent
      .create({
        data: {
          workspaceId: account.workspaceId,
          source: "SYSTEM",
          level: "ERROR",
          message: "Persistent menu could not be published to Instagram",
          payload: { reason: message.slice(0, 500) },
        },
      })
      .catch(() => {});
    return message;
  }
}
