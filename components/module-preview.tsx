"use client";

import { useI18n } from "@/lib/i18n/provider";

export interface PreviewCard {
  imageUrl: string;
  title: string;
  subtitle: string;
  imageLinkUrl: string;
  buttons: { label: string; url: string }[];
}

/**
 * How the module looks in an Instagram DM: an optional intro bubble, then the
 * cards as a horizontally scrolling carousel.
 */
export default function ModulePreview({
  introText,
  cards,
  showIntro = true,
}: {
  introText: string;
  cards: PreviewCard[];
  showIntro?: boolean;
}) {
  const { t } = useI18n();
  const visible = cards.filter(
    (card) => card.title.trim() || card.imageUrl.trim() || card.subtitle.trim()
  );

  return (
    <div className="w-full max-w-[22rem] rounded-2xl border border-border bg-zinc-950 p-3 text-white shadow-sm">
      {showIntro && introText.trim() && (
        <div className="mb-3">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">
            {t("Sent first, in DMs only")}
          </p>
          <div className="inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl bg-zinc-800 px-3 py-2 text-sm">
            {introText}
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="py-10 text-center text-xs text-zinc-500">
          {t("Add a card to see the preview.")}
        </p>
      ) : (
        <div className="flex snap-x gap-2 overflow-x-auto pb-2">
          {visible.map((card, index) => (
            <div
              key={index}
              className="flex w-56 shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-zinc-900"
            >
              {card.imageUrl.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.imageUrl}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-zinc-800 text-xs text-zinc-500">
                  {t("No image")}
                </div>
              )}
              <div className="flex-1 px-3 py-2">
                <p className="line-clamp-2 text-sm font-semibold">
                  {card.title || t("Card title")}
                </p>
                {card.subtitle && (
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{card.subtitle}</p>
                )}
              </div>
              {card.buttons
                .filter((button) => button.label.trim())
                .map((button, buttonIndex) => (
                  <div
                    key={buttonIndex}
                    className="border-t border-zinc-800 py-2 text-center text-sm font-medium"
                  >
                    {button.label}
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
