"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import ModulePreview, { type PreviewCard } from "@/components/module-preview";
import CardImageField from "@/components/card-image-field";
import StoreProductPicker, { type StoreProduct } from "@/components/store-product-picker";
import { useI18n } from "@/lib/i18n/provider";

const MAX_CARDS = 10;
const MAX_BUTTONS = 3;
const TITLE_MAX = 80;
const SUBTITLE_MAX = 80;
const LABEL_MAX = 20;
const MAX_QUICK_REPLIES = 13;

type DraftButton = PreviewCard["buttons"][number];
/** linkImage: tapping the image opens the first link button's page. */
type DraftCard = PreviewCard & { linkImage: boolean };
interface DraftQuickReply {
  title: string;
  moduleId: string;
}
interface ModuleOption {
  id: string;
  name: string;
}
interface SlotClicks {
  card: number;
  slot: string;
  clicks: number;
  uniqueClicks: number;
}
interface LoadedModule {
  id: string;
  name: string;
  introText: string | null;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string | null;
  cards: {
    id?: string;
    imageUrl: string | null;
    title: string;
    subtitle: string | null;
    imageLinkUrl: string | null;
    buttons: { label: string; url: string | null; moduleId: string | null }[];
  }[];
  quickReplies: { title: string; moduleId: string }[];
  quickReplyPrompt: string | null;
  automations: { id: string; name: string; dmOnly: boolean; isActive: boolean }[];
  clicks: SlotClicks[];
}
type Field = "image" | "title" | "imageLink" | `button${number}`;
interface Issue {
  card: number | null;
  field?: Field;
  message: string;
}

const emptyCard = (): DraftCard => ({
  imageUrl: "",
  title: "",
  subtitle: "",
  imageLinkUrl: "",
  linkImage: true,
  buttons: [{ label: "", url: "", kind: "url", moduleId: "" }],
});

const isBlankButton = (b: DraftButton) => !b.label.trim() && !(b.kind === "module" ? b.moduleId : b.url.trim());
const isBlankCard = (c: DraftCard) => !c.imageUrl.trim() && !c.title.trim() && !c.subtitle.trim() && c.buttons.every(isBlankButton);
const isHttps = (value: string) => /^https:\/\/\S+$/i.test(value.trim());
const firstLink = (card: { buttons: DraftButton[] }) => card.buttons.find((b) => b.kind === "url" && b.url.trim())?.url.trim() ?? "";
const imageLinkOf = (card: DraftCard) => (card.linkImage ? firstLink(card) : card.imageLinkUrl.trim());

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none";
const invalidClass = "border-error/60";

export default function ModuleEditor({ moduleId }: { moduleId?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(Boolean(moduleId));
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [name, setName] = useState("");
  const [introText, setIntroText] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmSource, setUtmSource] = useState("paklab");
  const [utmMedium, setUtmMedium] = useState("dm");
  const [showUtm, setShowUtm] = useState(false);
  const [cards, setCards] = useState<DraftCard[]>([emptyCard()]);
  const [active, setActive] = useState(0);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [usedBy, setUsedBy] = useState<LoadedModule["automations"]>([]);
  const [clicks, setClicks] = useState<SlotClicks[]>([]);
  const [quickReplies, setQuickReplies] = useState<DraftQuickReply[]>([]);
  const [quickReplyPrompt, setQuickReplyPrompt] = useState("");
  const [moduleOptions, setModuleOptions] = useState<ModuleOption[]>([]);
  const [accountName, setAccountName] = useState("");

  // Modules a button or quick reply can send (this one included: "back to menu"),
  // and the account name for the preview.
  useEffect(() => {
    fetch("/api/modules", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (payload.success) setModuleOptions(payload.data);
      })
      .catch(() => {});
    fetch("/api/instagram/accounts")
      .then((r) => r.json())
      .then((payload) => {
        if (payload.success) setAccountName(payload.data.instagramAccounts?.[0]?.username ?? "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!moduleId) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/modules?id=${moduleId}`);
      const data = await res.json().catch(() => null);
      if (cancelled) return;
      if (!data?.success) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const loaded = data.data as LoadedModule;
      setName(loaded.name);
      setIntroText(loaded.introText ?? "");
      setUtmCampaign(loaded.utmCampaign ?? "");
      setUtmSource(loaded.utmSource);
      setUtmMedium(loaded.utmMedium);
      setCards(
        loaded.cards.length > 0
          ? loaded.cards.map((card) => {
              const buttons = card.buttons.map((b) => ({
                label: b.label,
                url: b.url ?? "",
                kind: b.moduleId ? ("module" as const) : ("url" as const),
                moduleId: b.moduleId ?? "",
              }));
              const imageLinkUrl = card.imageLinkUrl ?? "";
              return {
                id: card.id,
                imageUrl: card.imageUrl ?? "",
                title: card.title,
                subtitle: card.subtitle ?? "",
                imageLinkUrl,
                linkImage: imageLinkUrl === firstLink({ buttons }),
                buttons,
              };
            })
          : [emptyCard()]
      );
      setQuickReplies(loaded.quickReplies ?? []);
      setQuickReplyPrompt(loaded.quickReplyPrompt ?? "");
      setUsedBy(loaded.automations);
      setClicks(loaded.clicks);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function touch() {
    setSaved(false);
    setDirty(true);
    setIssue(null);
  }

  function updateCard(index: number, patch: Partial<DraftCard>) {
    touch();
    setCards((prev) => prev.map((card, i) => (i === index ? { ...card, ...patch } : card)));
  }

  function updateButton(cardIndex: number, buttonIndex: number, patch: Partial<DraftButton>) {
    touch();
    setCards((prev) =>
      prev.map((card, i) =>
        i === cardIndex
          ? { ...card, buttons: card.buttons.map((button, j) => (j === buttonIndex ? { ...button, ...patch } : button)) }
          : card
      )
    );
  }

  function moveCard(from: number, to: number) {
    if (to < 0 || to >= cards.length || from === to) return;
    touch();
    setCards((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setActive(to);
  }

  function addCards(newCards: DraftCard[]) {
    touch();
    const base = cards.length === 1 && isBlankCard(cards[0]) ? [] : cards;
    const room = MAX_CARDS - base.length;
    const next = [...base, ...newCards.slice(0, room)];
    setCards(next.length ? next : [emptyCard()]);
    setActive(Math.min(base.length, next.length - 1));
  }

  function fromProducts(products: StoreProduct[]) {
    addCards(
      products.map((p) => ({
        imageUrl: p.images[0] ?? "",
        title: p.title.slice(0, TITLE_MAX),
        subtitle: p.price.slice(0, SUBTITLE_MAX),
        imageLinkUrl: p.url,
        linkImage: true,
        buttons: [{ label: t("Shop now").slice(0, LABEL_MAX), url: p.url, kind: "url", moduleId: "" }],
      }))
    );
  }

  /** Problems to fix before saving, pointing at the card and field. */
  function findIssue(): Issue | null {
    if (!name.trim()) return { card: null, message: t("Give the module a name.") };
    for (const [index, card] of cards.entries()) {
      const n = index + 1;
      if (!card.title.trim()) return { card: index, field: "title", message: t("Card {n} needs a title.", { n }) };
      const buttons = card.buttons.filter((b) => !isBlankButton(b));
      if (!card.imageUrl.trim() && !card.subtitle.trim() && buttons.length === 0)
        return { card: index, field: "image", message: t("Card {n} needs an image, a description or a button.", { n }) };
      if (card.imageUrl.trim() && !isHttps(card.imageUrl))
        return { card: index, field: "image", message: t("Card {n}: the image link must start with https://", { n }) };
      if (!card.linkImage && card.imageLinkUrl.trim() && !isHttps(card.imageLinkUrl))
        return { card: index, field: "imageLink", message: t("Card {n}: the image tap link must start with https://", { n }) };
      for (const [buttonIndex, button] of card.buttons.entries()) {
        if (isBlankButton(button)) continue;
        const field = `button${buttonIndex}` as Field;
        if (button.kind === "module") {
          if (!button.label.trim() || !button.moduleId)
            return { card: index, field, message: t("Card {n}: a module button needs a label and a module to send.", { n }) };
        } else if (!button.label.trim() || !isHttps(button.url)) {
          return { card: index, field, message: t("Card {n}: every button needs a label and an https:// link.", { n }) };
        }
      }
    }
    for (const reply of quickReplies) {
      if (!reply.title.trim() || !reply.moduleId)
        return { card: null, message: t("Every quick reply needs a title and a module to send.") };
    }
    return null;
  }

  async function save() {
    setSaveError(null);
    const problem = findIssue();
    setIssue(problem);
    if (problem) {
      if (problem.card !== null) setActive(problem.card);
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      introText: introText.trim() || null,
      utmSource: utmSource.trim() || "paklab",
      utmMedium: utmMedium.trim() || "dm",
      utmCampaign: utmCampaign.trim() || null,
      cards: cards.map((card) => ({
        ...(card.id ? { id: card.id } : {}),
        imageUrl: card.imageUrl.trim() || null,
        title: card.title.trim(),
        subtitle: card.subtitle.trim() || null,
        imageLinkUrl: imageLinkOf(card) || null,
        buttons: card.buttons
          .filter((b) => !isBlankButton(b))
          .map((b) =>
            b.kind === "module"
              ? { label: b.label.trim(), url: null, moduleId: b.moduleId }
              : { label: b.label.trim(), url: b.url.trim(), moduleId: null }
          ),
      })),
      quickReplies: quickReplies.map((r) => ({ title: r.title.trim(), moduleId: r.moduleId })),
      quickReplyPrompt: quickReplyPrompt.trim() || null,
    };
    try {
      const res = await fetch(moduleId ? `/api/modules?id=${moduleId}` : "/api/modules", {
        method: moduleId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        setSaveError(t("Could not save the module. Check the cards and try again."));
        return;
      }
      setDirty(false);
      if (!moduleId) {
        router.push(`/modules/${data.data.id}`);
        return;
      }
      // Cards get ids on save; keep them so links follow the cards.
      const savedCards = (data.data.cards ?? []) as { id?: string }[];
      setCards((prev) => prev.map((card, i) => ({ ...card, id: savedCards[i]?.id ?? card.id })));
      setSaved(true);
    } catch {
      setSaveError(t("Could not save the module. Check the cards and try again."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!moduleId) return;
    if (!confirm(t("Delete this module? This cannot be undone."))) return;
    const res = await fetch(`/api/modules?id=${moduleId}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (data?.success) {
      setDirty(false);
      router.push("/modules");
    } else setSaveError(t("This module is still used by a campaign or DM rule. Switch them to another reply first."));
  }

  const slotClicks = (card: number, slot: string) => clicks.find((c) => c.card === card && c.slot === slot);
  const fieldInvalid = (cardIndex: number, field: Field) => issue?.card === cardIndex && issue.field === field;

  if (loading) return <div className="panel h-64 rounded" />;
  if (notFound)
    return (
      <div className="panel rounded p-8 text-center">
        <p className="text-sm text-muted">{t("Module not found.")}</p>
        <Link href="/modules" className="mt-4 inline-block text-sm text-accent">
          {t("Back to modules")}
        </Link>
      </div>
    );

  const card = cards[Math.min(active, cards.length - 1)];
  const n = active + 1;
  const imgStats = slotClicks(n, "img");
  const linkButton = firstLink(card);

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/modules" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("Message modules")}
        </Link>
        <div className="hidden items-center gap-2 lg:flex">
          {saved && <span className="text-sm text-success">{t("Changes saved")}</span>}
          {dirty && !saved && <span className="text-sm text-muted">{t("Unsaved changes")}</span>}
          {moduleId && (
            <button
              onClick={() => void remove()}
              className="rounded border border-error/20 px-4 py-2 text-sm font-medium text-error hover:bg-error/10"
            >
              {t("Delete")}
            </button>
          )}
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? t("Saving…") : moduleId ? t("Save changes") : t("Create module")}
          </button>
        </div>
      </div>

      {(issue || saveError) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          <span>{issue?.message ?? saveError}</span>
          {issue?.card !== null && issue?.card !== undefined && (
            <button onClick={() => setActive(issue.card as number)} className="text-xs font-medium underline">
              {t("Go to card {n}", { n: issue.card + 1 })}
            </button>
          )}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <section className="panel space-y-4 rounded-xl p-5">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{t("Module name")}</span>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  touch();
                }}
                maxLength={100}
                placeholder={t("e.g. Messi #256 cards")}
                className={`${inputClass} ${issue && issue.card === null && !name.trim() ? invalidClass : ""}`}
              />
              <span className="mt-1 block text-xs text-muted">{t("Only you see this name.")}</span>
            </label>
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-sm font-medium">
                <span>
                  {t("Intro message")} <span className="font-normal text-muted">{t("(optional)")}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIntroText((v) => `${v}{username}`);
                    touch();
                  }}
                  className="rounded-full border border-border px-2 py-0.5 text-[11px] font-normal text-muted hover:text-foreground"
                >
                  <Plus className="mr-0.5 inline h-3 w-3 align-[-1px]" aria-hidden />
                  {t("their name")}
                </button>
              </span>
              <textarea
                value={introText}
                onChange={(e) => {
                  setIntroText(e.target.value);
                  touch();
                }}
                maxLength={1000}
                rows={2}
                placeholder={t("Hi {username}! Here are the details:", { username: "{username}" })}
                className={inputClass}
              />
              <span className="mt-1 block text-xs text-muted">
                {t("Sent before the cards when someone DMs a keyword or taps a button. A reply to a comment can only be one message, so there the cards go alone.")}
              </span>
            </label>
          </section>

          <section className="panel space-y-4 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {t("Carousel cards")} <span className="font-normal text-muted">{cards.length}/{MAX_CARDS}</span>
              </h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  disabled={cards.length >= MAX_CARDS && !(cards.length === 1 && isBlankCard(cards[0]))}
                  className="rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/15 disabled:opacity-40"
                >
                  <ShoppingBag className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                  {t("Add from store")}
                </button>
                <button
                  type="button"
                  onClick={() => addCards([emptyCard()])}
                  disabled={cards.length >= MAX_CARDS}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground disabled:opacity-40"
                >
                  <Plus className="mr-0.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                  {t("Blank card")}
                </button>
              </div>
            </div>

            {/* Card strip: pick one to edit, drag to reorder. */}
            <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t("Carousel cards")}>
              {cards.map((c, index) => (
                <button
                  key={index}
                  type="button"
                  role="tab"
                  aria-selected={index === active}
                  draggable
                  onDragStart={() => setDragFrom(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragFrom !== null) moveCard(dragFrom, index);
                    setDragFrom(null);
                  }}
                  onClick={() => setActive(index)}
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${
                    index === active ? "border-accent" : issue?.card === index ? "border-error/60" : "border-border hover:border-accent/40"
                  }`}
                  title={c.title || t("Card {n}", { n: index + 1 })}
                >
                  {c.imageUrl.trim() ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-surface text-[10px] text-muted">
                      {t("No image")}
                    </span>
                  )}
                  <span className="absolute left-0.5 top-0.5 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">
                    {index + 1}
                  </span>
                </button>
              ))}
              {cards.length < MAX_CARDS && (
                <button
                  type="button"
                  onClick={() => addCards([emptyCard()])}
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-border text-xl text-muted hover:border-accent/40 hover:text-foreground"
                  aria-label={t("Blank card")}
                >
                  <Plus className="h-5 w-5" aria-hidden />
                </button>
              )}
            </div>

            <div className="rounded-lg border border-border p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">{t("Card {n}", { n })}</h4>
                <div className="flex items-center gap-1 text-xs">
                  <button
                    onClick={() => moveCard(active, active - 1)}
                    disabled={active === 0}
                    className="rounded border border-border px-2 py-1 text-muted hover:text-foreground disabled:opacity-30"
                    aria-label={t("Move left")}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    onClick={() => moveCard(active, active + 1)}
                    disabled={active === cards.length - 1}
                    className="rounded border border-border px-2 py-1 text-muted hover:text-foreground disabled:opacity-30"
                    aria-label={t("Move right")}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    onClick={() => {
                      if (cards.length >= MAX_CARDS) return;
                      touch();
                      const copy = { ...structuredClone(card), id: undefined };
                      setCards((prev) => [...prev.slice(0, active + 1), copy, ...prev.slice(active + 1)]);
                      setActive(active + 1);
                    }}
                    disabled={cards.length >= MAX_CARDS}
                    className="rounded border border-border px-2 py-1 text-muted hover:text-foreground disabled:opacity-30"
                  >
                    <Copy className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                    {t("Duplicate card")}
                  </button>
                  <button
                    onClick={() => {
                      touch();
                      setCards((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== active) : [emptyCard()]));
                      setActive((a) => Math.max(0, Math.min(a, cards.length - 2)));
                    }}
                    className="rounded border border-error/20 px-2 py-1 text-error hover:bg-error/10"
                  >
                    <Trash2 className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                    {t("Remove")}
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
                <div className="min-w-0 max-w-[12rem] sm:max-w-none">
                  <CardImageField
                    value={card.imageUrl}
                    onChange={(url) => updateCard(active, { imageUrl: url })}
                    invalid={fieldInvalid(active, "image")}
                  />
                </div>
                <div className="min-w-0 space-y-3">
                  <label className="block">
                    <span className="mb-1 flex justify-between text-xs text-muted">
                      <span>{t("Title")}</span>
                      <span>
                        {card.title.length}/{TITLE_MAX}
                      </span>
                    </span>
                    <input
                      value={card.title}
                      maxLength={TITLE_MAX}
                      onChange={(e) => updateCard(active, { title: e.target.value })}
                      placeholder={t("e.g. Messi #256 hoodie")}
                      className={`${inputClass} ${fieldInvalid(active, "title") ? invalidClass : ""}`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 flex justify-between text-xs text-muted">
                      <span>{t("Description")}</span>
                      <span>
                        {card.subtitle.length}/{SUBTITLE_MAX}
                      </span>
                    </span>
                    <textarea
                      value={card.subtitle}
                      maxLength={SUBTITLE_MAX}
                      rows={2}
                      onChange={(e) => updateCard(active, { subtitle: e.target.value.replace(/\n/g, " ") })}
                      placeholder={t("e.g. US$58 · free shipping over US$100")}
                      className={inputClass}
                    />
                  </label>
                  <div>
                    <span className="mb-1 flex justify-between text-xs text-muted">
                      <span>{t("When the image is tapped, open")}</span>
                      {imgStats && <span>{t("{count} clicks", { count: imgStats.uniqueClicks })}</span>}
                    </span>
                    <label className="mb-2 flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={card.linkImage}
                        onChange={(e) =>
                          updateCard(active, {
                            linkImage: e.target.checked,
                            imageLinkUrl: e.target.checked ? card.imageLinkUrl : card.imageLinkUrl || linkButton,
                          })
                        }
                      />
                      {t("Same as the first button's link")}
                      {card.linkImage && (
                        <span className="truncate text-muted">{linkButton || t("(no link button yet)")}</span>
                      )}
                    </label>
                    {!card.linkImage && (
                      <input
                        value={card.imageLinkUrl}
                        onChange={(e) => updateCard(active, { imageLinkUrl: e.target.value })}
                        placeholder={t("https:// (leave empty: the image opens nothing)")}
                        className={`${inputClass} ${fieldInvalid(active, "imageLink") ? invalidClass : ""}`}
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <p className="text-xs font-medium text-muted">
                  {t("Buttons")} <span className="font-normal">{card.buttons.length}/{MAX_BUTTONS}</span>
                </p>
                {card.buttons.map((button, buttonIndex) => {
                  const stats = slotClicks(n, `btn${buttonIndex + 1}`);
                  const invalid = fieldInvalid(active, `button${buttonIndex}`);
                  return (
                    <div
                      key={buttonIndex}
                      className={`space-y-2 rounded-md border p-3 ${invalid ? "border-error/60" : "border-border"}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted">{t("Button {n}", { n: buttonIndex + 1 })}</span>
                        <div className="inline-flex overflow-hidden rounded-md border border-border text-xs" role="radiogroup">
                          {(["url", "module"] as const).map((kind) => (
                            <button
                              key={kind}
                              type="button"
                              role="radio"
                              aria-checked={button.kind === kind}
                              onClick={() => updateButton(active, buttonIndex, { kind })}
                              className={`px-2.5 py-1 ${button.kind === kind ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}
                            >
                              {kind === "url" ? t("Open a link") : t("Send a module")}
                            </button>
                          ))}
                        </div>
                        {stats && (
                          <span className="text-xs text-muted">{t("{count} clicks", { count: stats.uniqueClicks })}</span>
                        )}
                        <button
                          onClick={() => {
                            touch();
                            setCards((prev) =>
                              prev.map((c, i) => (i === active ? { ...c, buttons: c.buttons.filter((_, j) => j !== buttonIndex) } : c))
                            );
                          }}
                          className="ml-auto text-xs text-muted hover:text-error"
                          aria-label={t("Remove button")}
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <div className="relative sm:w-44">
                          <input
                            value={button.label}
                            maxLength={LABEL_MAX}
                            onChange={(e) => updateButton(active, buttonIndex, { label: e.target.value })}
                            placeholder={t("Button text")}
                            className={`${inputClass} pr-12`}
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted">
                            {button.label.length}/{LABEL_MAX}
                          </span>
                        </div>
                        {button.kind === "module" ? (
                          <select
                            value={button.moduleId}
                            onChange={(e) => updateButton(active, buttonIndex, { moduleId: e.target.value })}
                            className={inputClass}
                          >
                            <option value="">{t("Choose a module…")}</option>
                            {moduleOptions.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.id === moduleId ? `${m.name} (${t("this module")})` : m.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={button.url}
                            onChange={(e) => updateButton(active, buttonIndex, { url: e.target.value })}
                            placeholder="https://"
                            className={inputClass}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
                {card.buttons.length < MAX_BUTTONS && (
                  <button
                    onClick={() =>
                      updateCard(active, {
                        buttons: [...card.buttons, { label: "", url: linkButton, kind: "url", moduleId: "" }],
                      })
                    }
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    {t("+ Add a button")}
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="panel space-y-3 rounded-xl p-5">
            <div>
              <h3 className="text-sm font-semibold">
                {t("Quick replies")} <span className="font-normal text-muted">{quickReplies.length}/{MAX_QUICK_REPLIES}</span>
              </h3>
              <p className="mt-1 text-xs text-muted">
                {t("Tappable chips under the reply. Each one sends another module, so people can choose what to see next.")}
              </p>
            </div>
            {quickReplies.length > 0 && (
              <label className="block">
                <span className="mb-1 block text-xs text-muted">{t("Message the chips sit under")}</span>
                <input
                  value={quickReplyPrompt}
                  maxLength={1000}
                  onChange={(e) => {
                    touch();
                    setQuickReplyPrompt(e.target.value);
                  }}
                  placeholder={t("e.g. Want to see something else?")}
                  className={inputClass}
                />
              </label>
            )}
            {quickReplies.map((reply, replyIndex) => (
              <div key={replyIndex} className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={reply.title}
                  maxLength={LABEL_MAX}
                  onChange={(e) => {
                    touch();
                    setQuickReplies((prev) => prev.map((r, i) => (i === replyIndex ? { ...r, title: e.target.value } : r)));
                  }}
                  placeholder={t("Chip text")}
                  className={`${inputClass} sm:w-48`}
                />
                <select
                  value={reply.moduleId}
                  onChange={(e) => {
                    touch();
                    setQuickReplies((prev) => prev.map((r, i) => (i === replyIndex ? { ...r, moduleId: e.target.value } : r)));
                  }}
                  className={inputClass}
                >
                  <option value="">{t("Choose a module…")}</option>
                  {moduleOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id === moduleId ? `${m.name} (${t("this module")})` : m.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    touch();
                    setQuickReplies((prev) => prev.filter((_, i) => i !== replyIndex));
                  }}
                  className="shrink-0 rounded border border-border px-2 py-2 text-xs text-muted hover:text-foreground"
                  aria-label={t("Remove quick reply")}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
            {quickReplies.length < MAX_QUICK_REPLIES && (
              <button
                onClick={() => {
                  touch();
                  setQuickReplies((prev) => [...prev, { title: "", moduleId: "" }]);
                }}
                className="text-xs font-medium text-accent hover:underline"
              >
                {t("+ Add a quick reply ({count}/{max})", { count: quickReplies.length, max: MAX_QUICK_REPLIES })}
              </button>
            )}
          </section>

          <section className="panel space-y-3 rounded-xl p-5">
            <button
              type="button"
              onClick={() => setShowUtm((v) => !v)}
              className="flex w-full items-center justify-between text-left text-sm font-semibold"
              aria-expanded={showUtm}
            >
              <span>
                {t("Link tracking")} <span className="font-normal text-muted">UTM</span>
              </span>
              {showUtm ? <ChevronUp className="h-4 w-4 text-muted" aria-hidden /> : <ChevronDown className="h-4 w-4 text-muted" aria-hidden />}
            </button>
            {showUtm && (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">
                    {t("Product code for tracking")} (utm_campaign)
                  </span>
                  <input
                    value={utmCampaign}
                    onChange={(e) => {
                      setUtmCampaign(e.target.value);
                      touch();
                    }}
                    maxLength={100}
                    placeholder="messi256"
                    className={inputClass}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted">utm_source</span>
                    <input
                      value={utmSource}
                      onChange={(e) => {
                        setUtmSource(e.target.value);
                        touch();
                      }}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted">utm_medium</span>
                    <input
                      value={utmMedium}
                      onChange={(e) => {
                        setUtmMedium(e.target.value);
                        touch();
                      }}
                      className={inputClass}
                    />
                  </label>
                </div>
                <p className="text-xs text-muted">
                  {t("Every card link gets UTM tags automatically, e.g. card 1's image is utm_term=c1img and its button c1btn. Tags already on a link are kept.")}
                </p>
              </div>
            )}
          </section>

          {moduleId && (
            <section className="panel rounded-xl p-5">
              <h3 className="mb-2 text-sm font-semibold">{t("Used by")}</h3>
              {usedBy.length === 0 ? (
                <p className="text-sm text-muted">{t("Not used yet. Pick it in a campaign or a DM keyword rule.")}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {usedBy.map((automation) => (
                    <li key={automation.id}>
                      <Link
                        href={automation.dmOnly ? "/dm-keywords" : `/campaigns/${automation.id}`}
                        className="text-accent hover:underline"
                      >
                        {automation.name}
                      </Link>{" "}
                      <span className="text-xs text-muted">
                        · {automation.dmOnly ? t("DM keyword rule") : t("Campaign")} ·{" "}
                        {automation.isActive ? t("Active") : t("Paused")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <div>
          <div className="lg:sticky lg:top-6">
            <p className="mb-3 text-sm text-muted">{t("Preview · tap a card to edit it")}</p>
            <ModulePreview
              introText={introText}
              cards={cards}
              quickReplies={quickReplies.map((r) => r.title).filter((title) => title.trim())}
              quickReplyPrompt={quickReplyPrompt}
              accountName={accountName}
              activeIndex={active}
              onSelect={setActive}
            />
            <p className="mt-3 text-xs text-muted">
              {t("Cards show in the Instagram app. Instagram on the web does not display them.")}
            </p>
          </div>
        </div>
      </div>

      {/* Phones: the save button stays in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        {saved && <span className="mr-auto text-xs text-success">{t("Changes saved")}</span>}
        {dirty && !saved && <span className="mr-auto text-xs text-muted">{t("Unsaved changes")}</span>}
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? t("Saving…") : moduleId ? t("Save changes") : t("Create module")}
        </button>
      </div>

      <StoreProductPicker
        open={pickerOpen}
        maxSelectable={cards.length === 1 && isBlankCard(cards[0]) ? MAX_CARDS : MAX_CARDS - cards.length}
        onClose={() => setPickerOpen(false)}
        onPick={fromProducts}
      />
    </div>
  );
}
