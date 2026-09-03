"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import { GoogleConnectCard } from "@/components/admin/GoogleConnectCard";

function Body() {
  const params = useSearchParams();
  /* the OAuth callback redirects here with ?connected=1 or ?error=<code> */
  const notice = params.get("error") ?? params.get("connected");
  return <GoogleConnectCard notice={notice} />;
}

export default function GoogleSettingsPage() {
  return (
    <div className="w-full max-w-3xl">
      <PageHeader
        title="Google Calendar"
        description="Link your own Google account to this staff profile."
        crumbs={[{ label: "Settings" }, { label: "Google Calendar" }]}
      />
      <Suspense>
        <Body />
      </Suspense>
    </div>
  );
}
