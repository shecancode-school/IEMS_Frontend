"use client";

import { useRequireAuth } from "@/context/AuthContext";
import { ApiDocs } from "@/components/admin/ApiDocs";

/* Standalone Swagger UI page. The spec (/api/docs) is super-admin only, so
   unauthenticated visitors are sent to the admin login; the shared <ApiDocs>
   component fetches the spec with the stored admin token and renders it. */
export default function ApiDocsPage() {
  const { isAuthenticated } = useRequireAuth("admin", "/admin");
  if (!isAuthenticated) return null;
  return (
    <div className="min-h-screen bg-white">
      <ApiDocs />
    </div>
  );
}
