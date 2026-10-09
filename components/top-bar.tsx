"use client";

/**
 * Top Bar
 *
 * Breadcrumb with the page title, mobile menu button, and connection status.
 */

import type { StaticMessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { usePathname } from "next/navigation";
import { ChevronRight, Link2, Menu } from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";

const pageTitles: Record<string, StaticMessageKey> = {
  "/dashboard": "Dashboard",
  "/overview": "Overview",
  "/inbox": "Inbox",
  "/campaigns/import": "Import campaigns",
  "/campaigns": "Campaigns",
  "/campaigns/new": "New Campaign",
  "/automations": "Campaigns",
  "/automations/new": "New Campaign",
  "/modules": "Message modules",
  "/modules/new": "New module",
  "/dm-keywords": "DM keywords",
  "/contacts": "Contacts",
  "/broadcasts": "Broadcasts",
  "/giveaway": "Giveaway",
  "/logs": "DM Logs",
  "/settings": "Settings",
  "/diagnostics": "Diagnostics",
};

interface TopBarProps {
  onMenuClick: () => void;
  instagramUsername: string | null;
  instagramAccountCount: number;
}

export default function TopBar({ onMenuClick, instagramUsername, instagramAccountCount }: TopBarProps) {
  const { t } = useI18n();
  const pathname = usePathname();
  const title: StaticMessageKey =
    pageTitles[pathname] ??
    (pathname.endsWith("/edit")
      ? "Edit campaign"
      : pathname.startsWith("/campaigns/")
        ? "Campaign details"
        : pathname.startsWith("/modules/")
          ? "Edit module"
          : "Dashboard");

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background px-4 lg:px-10"
      // Installed to the home screen the app starts at the very top of the
      // display, so without this the title sits under the clock and battery.
      // The inset is 0 in a browser tab and on desktop.
      style={{
        height: "calc(4rem + env(safe-area-inset-top))",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onMenuClick}
          className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground lg:hidden"
          aria-label={t("Toggle sidebar")}
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
          <span className="hidden shrink-0 sm:inline">{BRAND_NAME}</span>
          <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-faint sm:inline" aria-hidden />
          <h1 className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-foreground">
            {t(title)}
          </h1>
        </div>
      </div>

      {instagramAccountCount > 0 ? (
        <span className="inline-flex min-w-0 max-w-[50%] shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden />
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {instagramAccountCount > 1
              ? t("{count} accounts", { count: instagramAccountCount })
              : `@${instagramUsername}`}
          </span>
        </span>
      ) : (
        <a
          href="/api/instagram/connect"
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          {/* Full label needs more room than a 360px header has to spare. */}
          <span className="sm:hidden">{t("Connect")}</span>
          <span className="hidden sm:inline">{t("Connect Instagram")}</span>
        </a>
      )}
    </header>
  );
}
