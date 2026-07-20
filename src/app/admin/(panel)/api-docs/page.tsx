"use client";

import { PageHeader } from "@/components/admin/PageHeader";
import { ApiDocs } from "@/components/admin/ApiDocs";
import { Card } from "@/components/ui/card";

/* API documentation inside the admin panel, opened from the sidebar. */
export default function AdminApiDocsPage() {
  return (
    <div className="w-full">
      <PageHeader
        title="API documentation"
        description="The live OpenAPI spec — browse endpoints and try requests inline."
      />
      <Card className="overflow-hidden bg-white p-0 text-neutral-900 shadow-none">
        <ApiDocs className="min-h-125" />
      </Card>
    </div>
  );
}
