import { describe, expect, it } from "vitest";
import { syncModuleLinks } from "@/lib/modules/links";
import type { ModuleCard } from "@/lib/modules/schema";

interface Row {
  id: string;
  moduleId: string;
  slug: string;
  card: number;
  cardKey: string | null;
  slot: string;
  destinationUrl: string;
  retiredAt: Date | null;
}

/** An in-memory stand-in for the moduleLink table. */
function fakeTx(rows: Row[]) {
  let next = rows.length;
  const tx = {
    moduleLink: {
      findMany: async ({ where }: { where: { moduleId: string; retiredAt: null } }) =>
        rows.filter((r) => r.moduleId === where.moduleId && r.retiredAt === null).map((r) => ({ ...r })),
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) =>
        Object.assign(rows.find((r) => r.id === where.id)!, data),
      updateMany: async ({ where, data }: { where: { id: { in: string[] } }; data: Partial<Row> }) => {
        for (const r of rows) if (where.id.in.includes(r.id)) Object.assign(r, data);
        return { count: where.id.in.length };
      },
      create: async ({ data }: { data: Omit<Row, "id" | "retiredAt"> }) => {
        const row = { ...data, id: `row${++next}`, retiredAt: null } as Row;
        rows.push(row);
        return row;
      },
    },
  };
  return tx as unknown as Parameters<typeof syncModuleLinks>[0];
}

const card = (id: string, url: string): ModuleCard => ({
  id,
  imageUrl: null,
  title: id,
  subtitle: "s",
  imageLinkUrl: url,
  buttons: [],
});
const utm = { utmSource: "openreply", utmMedium: "dm", utmCampaign: null };
const sync = (rows: Row[], cards: ModuleCard[]) =>
  syncModuleLinks(fakeTx(rows), { workspaceId: "ws", moduleId: "mod", cards, utm });
const active = (rows: Row[]) => rows.filter((r) => !r.retiredAt);

describe("module links follow their card", () => {
  it("keeps each card's slug when the cards are reordered", async () => {
    const rows: Row[] = [];
    await sync(rows, [card("aaaaaa", "https://shop.test/a"), card("bbbbbb", "https://shop.test/b")]);
    const slugA = rows.find((r) => r.cardKey === "aaaaaa")!.slug;

    await sync(rows, [card("bbbbbb", "https://shop.test/b"), card("aaaaaa", "https://shop.test/a")]);
    const a = rows.find((r) => r.slug === slugA)!;
    expect(a.destinationUrl).toContain("https://shop.test/a");
    expect(a.card).toBe(2);
    expect(active(rows)).toHaveLength(2);
  });

  it("retires a removed card's link instead of pointing it elsewhere", async () => {
    const rows: Row[] = [];
    await sync(rows, [card("aaaaaa", "https://shop.test/a"), card("bbbbbb", "https://shop.test/b")]);
    const slugA = rows.find((r) => r.cardKey === "aaaaaa")!.slug;

    await sync(rows, [card("bbbbbb", "https://shop.test/b")]);
    const a = rows.find((r) => r.slug === slugA)!;
    expect(a.retiredAt).not.toBeNull();
    expect(a.destinationUrl).toContain("https://shop.test/a");
    expect(active(rows).map((r) => r.cardKey)).toEqual(["bbbbbb"]);
  });

  it("adopts links saved before cards had ids by their position", async () => {
    const rows: Row[] = [
      {
        id: "old1",
        moduleId: "mod",
        slug: "legacy",
        card: 1,
        cardKey: null,
        slot: "img",
        destinationUrl: "https://shop.test/a?utm_source=openreply",
        retiredAt: null,
      },
    ];
    await sync(rows, [card("aaaaaa", "https://shop.test/a")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slug: "legacy", cardKey: "aaaaaa", retiredAt: null });
  });

  it("updates the destination in place when a card's link is edited", async () => {
    const rows: Row[] = [];
    await sync(rows, [card("aaaaaa", "https://shop.test/a")]);
    const slug = rows[0].slug;
    await sync(rows, [card("aaaaaa", "https://shop.test/a-fixed")]);
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe(slug);
    expect(rows[0].destinationUrl).toContain("a-fixed");
  });
});
