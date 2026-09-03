"use client";

import { useRouter } from "next/navigation";
import { useCreateEvent } from "@/hooks/admin/events";
import { EventForm } from "@/components/admin/EventForm";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import type { EventFormValues } from "@/schemas/admin";
import type { EventCreateValues } from "@/schemas/admin";
import { kigaliInputToISO } from "@/lib/time";

export default function NewEventPage() {
  const router = useRouter();
  const create = useCreateEvent();

  async function onSubmit(v: EventFormValues) {
    /* the create endpoint doesn't take `status` */
    const payload: EventCreateValues = {
      name: v.name,
      slug: v.slug,
      category: v.category,
      type: v.type,
      /* datetime-local values are Kigali wall clock; pin the offset so the
         API stores the exact instant regardless of server TZ */
      startTime: kigaliInputToISO(v.startTime),
      /* required by the form now, so there is no empty case to skip */
      endTime: kigaliInputToISO(v.endTime),
      gallery: v.gallery,
      organiser: v.organiser,
      maxAttendees: v.maxAttendees,
      details: v.details,
      rules: v.rules,
      price: v.price,
      location: v.location,
      mode: v.mode,
      ...(v.host ? { host: v.host } : {}),
      isPublished: v.isPublished,
    };
    const res = await create.mutateAsync(payload);
    router.push(`/admin/events/${res.event.id}`);
  }

  return (
    <div className="w-full">
      <PageHeader
        title="New event"
        crumbs={[{ label: "Events", href: "/admin/events" }, { label: "New" }]}
      />
      <Card className="w-full shadow-none">
        <CardContent className="pt-6">
          <EventForm
            mode="create"
            submitting={create.isPending}
            onSubmit={onSubmit}
            onCancel={() => router.push("/admin/events")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
