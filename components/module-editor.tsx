"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ModulePreview, { type PreviewCard } from "@/components/module-preview";
import { useI18n } from "@/lib/i18n/provider";

const MAX_CARDS = 10;
const MAX_BUTTONS = 3;
const TITLE_MAX = 80;
const SUBTITLE_MAX = 80;
const LABEL_MAX = 20;

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
    imageUrl: string | null;
    title: string;
    subtitle: string | null;
    imageLinkUrl: string | null;
    buttons: { label: string; url: string }[];
  }[];
  automations: { id: string; name: string; dmOnly: boolean; isActive: boolean }[];
  clicks: SlotClicks[];
}

const emptyCard = (): PreviewCard => ({
  imageUrl: "",
  title: "",
  subtitle: "",
  imageLinkUrl: "",
  buttons: [{ label: "", url: "" }],
});

const isHttps = (value: string) => /^https:\/\/\S+$/i.test(value.trim());

const inputClass =
  "w-full rounded border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:border-accent/40 focus:outline-none";

export default function ModuleEditor({ moduleId }: { moduleId?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(Boolean(moduleId));
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  const [introText, setIntroText] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmSource, setUtmSource] = useState("openreply");
  const [utmMedium, setUtmMedium] = useState("dm");
  const [showUtm, setShowUtm] = useState(false);
  const [cards, setCards] = useState<PreviewCard[]>([emptyCard()]);
  const [usedBy, setUsedBy] = useState<LoadedModule["automations"]>([]);
  const [clicks, setClicks] = useState<SlotClicks[]>([]);

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
          ? loaded.cards.map((card) => ({
              imageUrl: card.imageUrl ?? "",
              title: card.title,
              subtitle: card.subtitle ?? "",
              imageLinkUrl: card.imageLinkUrl ?? "",
              buttons: card.buttons.length > 0 ? card.buttons : [],
            }))
          : [emptyCard()]
      );
      setUsedBy(loaded.automations);
      setClicks(loaded.clicks);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  function updateCard(index: number, patch: Partial<PreviewCard>) {
    setSaved(false);
    setCards((prev) => prev.map((card, i) => (i === index ? { ...card, ...patch } : card)));
  }

  function updateButton(cardIndex: number, buttonIndex: number, patch: Partial<{ label: string; url: string }>) {
    setSaved(false);
    setCards((prev) =>
      prev.map((card, i) =>
        i === cardIndex
          ? {
              ...card,
              buttons: card.buttons.map((button, j) => (j === buttonIndex ? { ...button, ...patch } : button)),
            }
          : card
      )
    );
  }

  function moveCard(index: number, delta: number) {
    setSaved(false);
    setCards((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  /** Client-side checks with messages people can act on; the API re-validates. */
  function validate(): string | null {
    if (!name.trim()) return t("Give the module a name.");
    for (const [index, card] of cards.entries()) {
      const n = index + 1;
      if (!card.title.trim()) return t("Card {n} needs a title.", { n });
      const buttons = card.buttons.filter((b) => b.label.trim() || b.url.trim());
      if (!card.imageUrl.trim() && !card.subtitle.trim() && buttons.length === 0)
        return t("Card {n} needs an image, a description or a button.", { n });
      if (card.imageUrl.trim() && !isHttps(card.imageUrl))
        return t("Card {n}: the image link must start with https://", { n });
      if (card.imageLinkUrl.trim() && !isHttps(card.imageLinkUrl))
        return t("Card {n}: the image tap link must start with https://", { n });
      for (const button of buttons) {
        if (!button.label.trim() || !isHttps(button.url))
          return t("Card {n}: every button needs a label and an https:// link.", { n });
      }
    }
    return null;
  }

  async function save() {
    setError(null);
    const problem = validate();
    if (problem) return setError(problem);
    setSaving(true);
    const payload = {
      name: name.trim(),
      introText: introText.trim() || null,
      utmSource: utmSource.trim() || "openreply",
      utmMedium: utmMedium.trim() || "dm",
      utmCampaign: utmCampaign.trim() || null,
      cards: cards.map((card) => ({
        imageUrl: card.imageUrl.trim() || null,
        title: card.title.trim(),
        subtitle: card.subtitle.trim() || null,
        imageLinkUrl: card.imageLinkUrl.trim() || null,
        buttons: card.buttons
          .filter((b) => b.label.trim() || b.url.trim())
          .map((b) => ({ label: b.label.trim(), url: b.url.trim() })),
      })),
    };
    try {
      const res = await fetch(moduleId ? `/api/modules?id=${moduleId}` : "/api/modules", {
        method: moduleId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        setError(t("Could not save the module. Check the cards and try again."));
        return;
      }
      if (!moduleId) {
        router.push(`/modules/${data.data.id}`);
        return;
      }
      setSaved(true);
    } catch {
      setError(t("Could not save the module. Check the cards and try again."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!moduleId) return;
    if (!confirm(t("Delete this module? This cannot be undone."))) return;
    const res = await fetch(`/api/modules?id=${moduleId}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (data?.success) router.push("/modules");
    else setError(t("This module is still used by a campaign or DM rule. Switch them to another reply first."));
  }

  const slotClicks = (card: number, slot: string) =>
    clicks.find((c) => c.card === card && c.slot === slot);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/modules" className="text-sm text-muted hover:text-foreground">
          ← {t("Message modules")}
        </Link>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm text-success">{t("Changes saved")}</span>}
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

      {error && (
        <div className="rounded border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <section className="panel space-y-4 rounded p-5">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">{t("Module name")}</span>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSaved(false);
                }}
                maxLength={100}
                placeholder={t("e.g. Messi #256 cards")}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">
                {t("Intro message")} <span className="font-normal text-muted">{t("(optional)")}</span>
              </span>
              <textarea
                value={introText}
                onChange={(e) => {
                  setIntroText(e.target.value);
                  setSaved(false);
                }}
                maxLength={1000}
                rows={2}
                placeholder={t("Hi {username}! Here are the details 👇", { username: "{username}" })}
                className={inputClass}
              />
              <span className="mt-1 block text-xs text-muted">
                {t("Sent before the cards when someone DMs a keyword or taps a button. A reply to a comment can only be one message, so there the cards go alone.")}
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">
                {t("Product code for tracking")} <span className="font-normal text-muted">(utm_campaign)</span>
              </span>
              <input
                value={utmCampaign}
                onChange={(e) => {
                  setUtmCampaign(e.target.value);
                  setSaved(false);
                }}
                maxLength={100}
                placeholder="messi256"
                className={inputClass}
              />
              <span className="mt-1 block text-xs text-muted">
                {t("Every card link gets UTM tags automatically, e.g. card 1's image is utm_term=c1img and its button c1btn. Tags already on a link are kept.")}
              </span>
            </label>
            <button
              type="button"
              onClick={() => setShowUtm((v) => !v)}
              className="text-xs text-muted underline hover:text-foreground"
            >
              {showUtm ? t("Hide UTM source and medium") : t("Change UTM source and medium")}
            </button>
            {showUtm && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">utm_source</span>
                  <input value={utmSource} onChange={(e) => setUtmSource(e.target.value)} className={inputClass} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">utm_medium</span>
                  <input value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} className={inputClass} />
                </label>
              </div>
            )}
          </section>

          {cards.map((card, index) => {
            const n = index + 1;
            const imgStats = slotClicks(n, "img");
            return (
              <section key={index} className="panel space-y-3 rounded p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{t("Card {n}", { n })}</h3>
                  <div className="flex items-center gap-1 text-xs">
                    <button
                      onClick={() => moveCard(index, -1)}
                      disabled={index === 0}
                      className="rounded border border-border px-2 py-1 text-muted hover:text-foreground disabled:opacity-30"
                      aria-label={t("Move up")}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveCard(index, 1)}
                      disabled={index === cards.length - 1}
                      className="rounded border border-border px-2 py-1 text-muted hover:text-foreground disabled:opacity-30"
                      aria-label={t("Move down")}
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => {
                        if (cards.length >= MAX_CARDS) return;
                        setSaved(false);
                        setCards((prev) => [...prev.slice(0, index + 1), structuredClone(card), ...prev.slice(index + 1)]);
                      }}
                      disabled={cards.length >= MAX_CARDS}
                      className="rounded border border-border px-2 py-1 text-muted hover:text-foreground disabled:opacity-30"
                    >
                      {t("Duplicate card")}
                    </button>
                    <button
                      onClick={() => {
                        setSaved(false);
                        setCards((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
                      }}
                      disabled={cards.length === 1}
                      className="rounded border border-error/20 px-2 py-1 text-error hover:bg-error/10 disabled:opacity-30"
                    >
                      {t("Remove")}
                    </button>
                  </div>
                </div>

                <div className="flex gap-3">
                  {card.imageUrl.trim() ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded border border-border object-cover" />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded border border-dashed border-border text-[10px] text-muted">
                      {t("No image")}
                    </div>
                  )}
                  <label className="block flex-1">
                    <span className="mb-1 block text-xs text-muted">{t("Image link (https://…, square works best)")}</span>
                    <input
                      value={card.imageUrl}
                      onChange={(e) => updateCard(index, { imageUrl: e.target.value })}
                      placeholder="https://cdn.shopify.com/…/card-1.png"
                      className={inputClass}
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 flex justify-between text-xs text-muted">
                    <span>{t("Title")}</span>
                    <span>{card.title.length}/{TITLE_MAX}</span>
                  </span>
                  <input
                    value={card.title}
                    maxLength={TITLE_MAX}
                    onChange={(e) => updateCard(index, { title: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 flex justify-between text-xs text-muted">
                    <span>{t("Description")}</span>
                    <span>{card.subtitle.length}/{SUBTITLE_MAX}</span>
                  </span>
                  <input
                    value={card.subtitle}
                    maxLength={SUBTITLE_MAX}
                    onChange={(e) => updateCard(index, { subtitle: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 flex justify-between text-xs text-muted">
                    <span>{t("When the image is tapped, open")}</span>
                    {imgStats && <span>{t("{count} clicks", { count: imgStats.uniqueClicks })}</span>}
                  </span>
                  <input
                    value={card.imageLinkUrl}
                    onChange={(e) => updateCard(index, { imageLinkUrl: e.target.value })}
                    placeholder="https://"
                    className={inputClass}
                  />
                </label>

                <div className="space-y-2">
                  <p className="text-xs text-muted">{t("Buttons (up to 3)")}</p>
                  {card.buttons.map((button, buttonIndex) => {
                    const stats = slotClicks(n, `btn${buttonIndex + 1}`);
                    return (
                      <div key={buttonIndex} className="flex flex-col gap-2 sm:flex-row">
                        <input
                          value={button.label}
                          maxLength={LABEL_MAX}
                          onChange={(e) => updateButton(index, buttonIndex, { label: e.target.value })}
                          placeholder={t("Button text")}
                          className={`${inputClass} sm:w-40`}
                        />
                        <input
                          value={button.url}
                          onChange={(e) => updateButton(index, buttonIndex, { url: e.target.value })}
                          placeholder="https://"
                          className={inputClass}
                        />
                        <div className="flex shrink-0 items-center gap-2">
                          {stats && (
                            <span className="text-xs text-muted">{t("{count} clicks", { count: stats.uniqueClicks })}</span>
                          )}
                          <button
                            onClick={() => {
                              setSaved(false);
                              setCards((prev) =>
                                prev.map((c, i) =>
                                  i === index ? { ...c, buttons: c.buttons.filter((_, j) => j !== buttonIndex) } : c
                                )
                              );
                            }}
                            className="rounded border border-border px-2 py-2 text-xs text-muted hover:text-foreground"
                            aria-label={t("Remove button")}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {card.buttons.length < MAX_BUTTONS && (
                    <button
                      onClick={() => updateCard(index, { buttons: [...card.buttons, { label: "", url: card.imageLinkUrl }] })}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      {t("+ Add a button")}
                    </button>
                  )}
                </div>
              </section>
            );
          })}

          {cards.length < MAX_CARDS && (
            <button
              onClick={() => {
                setSaved(false);
                setCards((prev) => [...prev, emptyCard()]);
              }}
              className="w-full rounded border border-dashed border-border py-3 text-sm font-medium text-muted hover:border-border-hover hover:text-foreground"
            >
              {t("+ Add a card ({count}/{max})", { count: cards.length, max: MAX_CARDS })}
            </button>
          )}

          {moduleId && (
            <section className="panel rounded p-5">
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
          <p className="mb-4 text-sm text-muted">{t("Preview")}</p>
          <div className="lg:sticky lg:top-6">
            <ModulePreview introText={introText} cards={cards} />
            <p className="mt-3 text-xs text-muted">
              {t("Cards show in the Instagram app. Instagram on the web does not display them.")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
