"use client";

import { PageHeader } from "@/components/admin/PageHeader";
import { AvailabilityForm } from "@/components/admin/AvailabilityForm";

export default function AvailabilityPage() {
  return (
    <div className="w-full max-w-3xl">
      <PageHeader
        title="Availability"
        description="When you are open to being booked, and the rules that apply."
        crumbs={[{ label: "Settings" }, { label: "Availability" }]}
      />
      <AvailabilityForm />
    </div>
  );
}
