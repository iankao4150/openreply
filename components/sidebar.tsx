"use client";

/**
 * Sidebar navigation: grouped, labelled items with icons, the house style
 * shared with Sopeak and One-paper (232px, active item on a warm tint).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bot,
  ChartLine,
  GalleryHorizontalEnd,
  Gift,
  Inbox,
  LayoutDashboard,
  MessageSquareReply,
  ScrollText,
  Send,
  Settings,
  Users,
} from "lucide-react";
import LanguageSwitcher from "@/components/language-switcher";
import type { StaticMessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { BRAND_NAME } from "@/lib/brand";

interface NavItem {
  label: StaticMessageKey;
  href: string;
  icon: LucideIcon;
}

const sections: { label: StaticMessageKey; items: NavItem[] }[] = [
  {
    label: "General",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Overview", href: "/overview", icon: ChartLine },
    ],
  },
  {
    label: "Conversations",
    items: [
      { label: "Inbox", href: "/inbox", icon: Inbox },
      { label: "Contacts", href: "/contacts", icon: Users },
      { label: "Broadcasts", href: "/broadcasts", icon: Send },
    ],
  },
  {
    label: "Automation",
    items: [
      { label: "Campaigns", href: "/campaigns", icon: MessageSquareReply },
      { label: "DM keywords", href: "/dm-keywords", icon: Bot },
      { label: "Message modules", href: "/modules", icon: GalleryHorizontalEnd },
    ],
  },
  {
    label: "Tools",
    items: [
      { label: "Giveaway", href: "/giveaway", icon: Gift },
      { label: "DM Logs", href: "/logs", icon: ScrollText },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Settings", href: "/settings", icon: Settings },
      { label: "Diagnostics", href: "/diagnostics", icon: Activity },
    ],
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceName: string;
}

export default function Sidebar({ isOpen, onClose, workspaceName }: SidebarProps) {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={onClose} />}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-dvh w-[232px] max-w-[85vw] shrink-0 flex-col border-r border-border bg-background transition-transform duration-200 ease-out lg:static lg:z-auto lg:h-full lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Same reason as the top bar: the drawer is full height, so the
            wordmark would otherwise land under the status bar. */}
        <div className="px-5 pb-5" style={{ paddingTop: "calc(1.5rem + env(safe-area-inset-top))" }}>
          <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-[11px] font-bold tracking-tight text-background">
              PR
            </span>
            <span className="text-[13px] font-semibold tracking-[0.06em]">{BRAND_NAME}</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="mb-1.5 px-3 text-[11px] font-medium tracking-wide text-faint">{t(section.label)}</p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors ${
                        active
                          ? "bg-surface-hover font-semibold text-foreground"
                          : "text-muted hover:bg-surface-hover hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                      {t(item.label)}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-3 border-t border-border px-5 py-4">
          <LanguageSwitcher />
          <p className="truncate text-xs text-muted">{workspaceName}</p>
        </div>
      </aside>
    </>
  );
}
