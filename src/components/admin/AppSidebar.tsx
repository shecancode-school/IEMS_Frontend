"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  CalendarDays,
  FileCode,
  Globe,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  PlusCircle,
  ScanLine,
  ShieldCheck,
  Ticket,
  UserPlus,
  Users,
} from "lucide-react";
import { useAdminAuth } from "@/context/AuthContext";
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

const MAIN = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/events", label: "Events", icon: CalendarDays },
  { href: "/admin/attendees", label: "Participants", icon: Users },
  { href: "/admin/guests", label: "Guests", icon: UserPlus },
  { href: "/admin/tickets", label: "Tickets", icon: Ticket },
  { href: "/admin/scanners", label: "Scanners", icon: ShieldCheck },
];

const OPERATIONS = [
  { href: "/admin/scan", label: "Scan tickets", icon: ScanLine },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/status", label: "API status", icon: Activity },
];

const SECONDARY = [
  { href: "/admin/api-docs", label: "API docs", icon: FileCode },
  { href: "/", label: "Public site", icon: Globe },
  { href: "mailto:support@igirerwanda.org", label: "Get help", icon: LifeBuoy },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAdminAuth();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
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
                  tooltip="New event"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear"
                >
                  <Link href="/admin/events/new">
                    <PlusCircle />
                    <span>New event</span>
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
              {MAIN.map((item) => (
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
              {OPERATIONS.map((item) => (
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
              {SECONDARY.map((item) => (
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
