"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n/provider";

export interface PreviewCard {
  /** Stable id of a saved card; keeps its tracked links when cards move. */
  id?: string;
  imageUrl: string;
  title: string;
  subtitle: string;
  imageLinkUrl: string;
  buttons: { label: string; url: string; kind: "url" | "module"; moduleId: string }[];
}

/**
 * How the module looks in an Instagram DM: an optional intro bubble, then the
 * cards as a horizontally scrolling carousel, then the quick-reply chips. With
 * `onSelect`, tapping a card picks it for editing and the selected card is
 * outlined and kept in view.
 */
export default function ModulePreview({
  introText,
  cards,
  showIntro = true,
  quickReplies = [],
  quickReplyPrompt,
  accountName,
  activeIndex,
  onSelect,
}: {
  introText: string;
  cards: PreviewCard[];
  showIntro?: boolean;
  quickReplies?: string[];
  quickReplyPrompt?: string;
  accountName?: string;
  activeIndex?: number;
  onSelect?: (index: number) => void;
}) {
  const { t } = useI18n();
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const selectable = Boolean(onSelect);
  // Without selection the preview shows only cards with content, as before.
  const entries = cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => selectable || card.title.trim() || card.imageUrl.trim() || card.subtitle.trim());

  useEffect(() => {
    if (activeIndex === undefined) return;
    cardRefs.current[activeIndex]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeIndex]);

  return (
    <div className="w-full max-w-[22rem] overflow-hidden rounded-[2rem] border-[6px] border-zinc-800 bg-black text-white shadow-lg">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <span className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-amber-400 via-pink-500 to-violet-600" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{accountName || t("Your account")}</span>
          <span className="block text-[10px] text-zinc-500">Instagram</span>
        </span>
      </div>

      <div className="space-y-3 px-3 py-4">
        {showIntro && introText.trim() && (
          <div className="flex items-end gap-2">
            <span className="h-6 w-6 shrink-0 rounded-full bg-zinc-700" />
            <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-zinc-800 px-3 py-2 text-sm">{introText}</div>
          </div>
        )}

        {entries.length === 0 ? (
          <p className="py-10 text-center text-xs text-zinc-500">{t("Add a card to see the preview.")}</p>
        ) : (
          <div className="flex items-start gap-2">
            <span className="mt-auto h-6 w-6 shrink-0 rounded-full bg-zinc-700" />
            <div className="flex min-w-0 snap-x gap-2 overflow-x-auto pb-2">
              {entries.map(({ card, index }) => {
                const active = selectable && index === activeIndex;
                const content = (
                  <>
                    {card.imageUrl.trim() ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={card.imageUrl} alt="" className="aspect-square w-full object-cover" />
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center bg-zinc-800 text-xs text-zinc-500">
                        {t("No image")}
                      </div>
                    )}
                    <div className="flex-1 px-3 py-2 text-left">
                      <p className="line-clamp-2 text-sm font-semibold">{card.title || t("Card {n}", { n: index + 1 })}</p>
                      {card.subtitle && <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{card.subtitle}</p>}
                    </div>
                    {card.buttons
                      .filter((button) => button.label.trim())
                      .map((button, buttonIndex) => (
                        <div key={buttonIndex} className="border-t border-zinc-800 py-2 text-center text-sm font-medium text-sky-300">
                          {button.label}
                        </div>
                      ))}
                  </>
                );
                return (
                  <div
                    key={index}
                    ref={(el) => {
                      cardRefs.current[index] = el;
                    }}
                    className="w-52 shrink-0 snap-start"
                  >
                    {selectable ? (
                      <button
                        type="button"
                        onClick={() => onSelect?.(index)}
                        className={`flex w-full flex-col overflow-hidden rounded-2xl bg-zinc-900 outline-offset-2 ${
                          active ? "outline outline-2 outline-accent" : "hover:outline hover:outline-1 hover:outline-zinc-600"
                        }`}
                        aria-label={t("Edit card {n}", { n: index + 1 })}
                        aria-pressed={active}
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="flex flex-col overflow-hidden rounded-2xl bg-zinc-900">{content}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {quickReplies.length > 0 && (
          <div className="space-y-2">
            {quickReplyPrompt !== undefined && (
              <div className="flex items-end gap-2">
                <span className="h-6 w-6 shrink-0 rounded-full bg-zinc-700" />
                <div className="max-w-[80%] rounded-2xl bg-zinc-800 px-3 py-2 text-sm">{quickReplyPrompt || "Choose one:"}</div>
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-1.5">
              {quickReplies.map((title, index) => (
                <span key={index} className="rounded-full border border-sky-400/60 px-3 py-1 text-xs text-sky-300">
                  {title}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
