"use client";

import { useRequireAuth } from "@/context/AuthContext";
import { useAdminLiveSync } from "@/hooks/admin/useAdminLiveSync";
import { AppSidebar } from "@/components/admin/AppSidebar";
import { SiteHeader } from "@/components/admin/SiteHeader";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const { ready, isAuthenticated } = useRequireAuth("admin", "/admin");
  /* stream gate scans, notifications and event edits into the caches */
  useAdminLiveSync();

  /* render nothing until hydrated (matches SSR) or when unauthenticated */
  if (!ready || !isAuthenticated) return null;

  return (
    <div className="admin-scope">
      <TooltipProvider delayDuration={0}>
        <SidebarProvider
          style={
            {
              "--sidebar-width": "16rem",
              "--header-height": "3.5rem",
            } as React.CSSProperties
          }
        >
          <AppSidebar />
          <SidebarInset>
            <SiteHeader />
            <div className="flex flex-1 flex-col p-4 md:p-6 lg:p-8">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}
