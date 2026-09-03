"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  CalendarClock,
  CalendarDays,
CalendarRange,
  Clock,
  Contact,
  FileCode,
  KeyRound,
  Globe,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Mail,
  PlusCircle,
  Link2,
  ScanLine,
  ScrollText,
  Ticket,
  UserPlus,
  Users,
  Users2,
} from "lucide-react";
import { useAdminAuth } from "@/context/AuthContext";
import { useCan } from "@/hooks/admin/staff";
import type { Capability } from "@/types/admin";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
// import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* medium-weight labels with a gentle slide + icon nudge on hover */
const NAV_ITEM =
  "font-medium transition-[transform,background-color,color] duration-200 hover:translate-x-0.5 [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:scale-110";

/* `cap` gates the item: omitted means everyone with a staff account sees it.
   This is presentation only — every route re-checks server-side, so hiding a
   link is a convenience, never the security boundary. */
type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  cap?: Capability;
};

const MAIN: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, cap: "events:write" },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarRange },
  { href: "/admin/calendar/me", label: "My schedule", icon: CalendarClock },
  { href: "/admin/events", label: "Events", icon: CalendarDays, cap: "events:write" },
  { href: "/admin/attendees", label: "Participants", icon: Users, cap: "attendees:write" },
  { href: "/admin/guests", label: "Guests", icon: UserPlus, cap: "attendees:write" },
  { href: "/admin/tickets", label: "Tickets", icon: Ticket, cap: "tickets:write" },
  { href: "/admin/staff", label: "Staff", icon: Users2, cap: "calendar:viewAll" },
  { href: "/admin/directory", label: "Directory", icon: Contact, cap: "calendar:viewAll" },
];

const OPERATIONS: NavItem[] = [
  { href: "/admin/bookings", label: "Bookings", icon: Clock, cap: "bookings:host" },
  { href: "/admin/scan", label: "Scan tickets", icon: ScanLine, cap: "tickets:write" },
  { href: "/admin/emails", label: "Emails", icon: Mail, cap: "emails:send" },
  { href: "/admin/notifications", label: "Notifications", icon: Bell, cap: "events:write" },
  { href: "/admin/status", label: "API status", icon: Activity, cap: "events:write" },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText, cap: "staff:manage" },
];

const SECONDARY: NavItem[] = [
  { href: "/admin/settings/availability", label: "Availability", icon: Clock, cap: "bookings:host" },
  { href: "/admin/settings/google", label: "Google Calendar", icon: Link2 },
  { href: "/admin/api-keys", label: "API keys", icon: KeyRound, cap: "staff:manage" },
  { href: "/admin/api-docs", label: "API docs", icon: FileCode, cap: "events:write" },
  { href: "/", label: "Public site", icon: Globe },
  { href: "mailto:support@igirerwanda.org", label: "Get help", icon: LifeBuoy },
];

const NAV_HREFS = [...MAIN, ...OPERATIONS, ...SECONDARY].map((i) => i.href);

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAdminAuth();
  const allow = useCan(user?.role, !!user);
  const visible = (items: NavItem[]) => items.filter((i) => !i.cap || allow(i.cap));
  const main = visible(MAIN);
  const operations = visible(OPERATIONS);
  const secondary = visible(SECONDARY);
  /* "New event" is the sidebar's quick action, but a facilitator-only account
     has no events:write — show them the calendar action instead */
  const canCreateEvents = allow("events:write");
  /* Nested entries like /admin/calendar and /admin/calendar/me both prefix-match
     the child route, so the parent would light up alongside the child. The most
     specific matching nav href wins. */
  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (!pathname.startsWith(`${href}/`)) return false;
    return !NAV_HREFS.some(
      (h) => h !== href && h.startsWith(`${href}/`) && (pathname === h || pathname.startsWith(`${h}/`))
    );
  };
  const initials = (user?.name ?? "A")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" className="data-[slot=sidebar-menu-button]:p-1.5!">
              <Link href="/admin/dashboard">
                <span className="flex size-8 shrink-0 items-center justify-center p-1">
                  <Image src="/iro-logo.svg" alt="side bar Logo" width={24} height={28} className="size-6" />
                </span>
                <span className="display text-base font-semibold tracking-wide">IEMS Admin</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* quick action row (mirrors dashboard-01's Quick Create) */}
        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              <SidebarMenuItem className="flex items-center gap-2">
                <SidebarMenuButton
                  asChild
                  tooltip={canCreateEvents ? "New event" : "New activity"}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear"
                >
                  <Link href={canCreateEvents ? "/admin/events/new" : "/admin/calendar?new=1"}>
                    <PlusCircle />
                    <span>{canCreateEvents ? "New event" : "New activity"}</span>
                  </Link>
                </SidebarMenuButton>
                {/* <Button asChild size="icon" variant="outline" className="size-8 shrink-0 group-data-[collapsible=icon]:opacity-0">
                  <Link href="/admin/notifications" aria-label="Notifications">
                    <Bell />
                  </Link>
                </Button> */}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {main.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.label} className={NAV_ITEM}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {operations.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.label} className={NAV_ITEM}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              {secondary.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    size="sm"
                    tooltip={item.label}
                    className="rounded-full font-medium transition-transform duration-200 hover:translate-x-0.5"
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-xs font-semibold text-primary">
                    {initials}
                  </span>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user?.name ?? "Admin"}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email ?? "Signed in"}
                    </span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-56">
                <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                  {user?.email ?? "Signed in"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => logout.mutate()}
                  className="text-red-600 focus:text-red-600"
                >
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
