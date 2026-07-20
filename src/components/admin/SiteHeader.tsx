"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ExternalLink } from "lucide-react";
import { useNotifications } from "@/hooks/admin/dashboard";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

const TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  events: "Events",
  attendees: "Participants",
  guests: "Guests",
  tickets: "Tickets",
  scanners: "Scanners",
  notifications: "Notifications",
  scan: "Scan tickets",
};

export function SiteHeader() {
  const pathname = usePathname();
  const seg = pathname.split("/")[2] ?? "dashboard";
  const title = TITLES[seg] ?? "Admin";
  const unread = useNotifications().data?.unread ?? 0;

  return (
    <header className="m-2 flex h-14 shrink-0 items-center gap-2 rounded-xl border border-border bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-8" />
        <h1 className="display text-base font-semibold">{title}</h1>
        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" className="relative" aria-label="Notifications">
            <Link href="/admin/notifications">
              <Bell className="size-5" />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" />
              )}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden sm:flex">
            <Link href="/" target="_blank">
              <ExternalLink className="size-4" />
              Public site
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
