"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useEvent, useUpdateEvent } from "@/hooks/admin/events";
import { EventForm } from "@/components/admin/EventForm";
import { PageHeader } from "@/components/admin/PageHeader";
import { TableSkeleton, EmptyState } from "@/components/admin/states";
import { Card, CardContent } from "@/components/ui/card";
import type { EventFormValues, EventUpdateBody, EventFormInput } from "@/schemas/admin";
import { isoToKigaliInput, kigaliInputToISO } from "@/lib/time";

export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: event, isPending } = useEvent(id);
  const update = useUpdateEvent();

  if (isPending) return <TableSkeleton rows={4} cols={2} />;
  if (!event)
    return (
      <EmptyState title="Event not found" message="It may have been deleted." />
    );

  const defaults: Partial<EventFormInput> = {
    name: event.name,
    slug: event.slug,
    category: event.category,
    type: event.type,
    startTime: isoToKigaliInput(event.startTime),
    endTime: isoToKigaliInput(event.endTime),
    gallery: event.gallery,
    organiser: event.organiser,
    maxAttendees: event.maxAttendees,
    details: event.details,
    rules: event.rules,
    price: event.price,
    location: event.location,
    isPublished: event.isPublished,
    status: event.status,
  };

  async function onSubmit(v: EventFormValues) {
    const body: EventUpdateBody = {
      name: v.name,
      category: v.category,
      type: v.type,
      /* the form's datetime-local values are Kigali wall clock; pin the
         offset so the API stores the exact instant regardless of server TZ */
      startTime: kigaliInputToISO(v.startTime),
      endTime: v.endTime ? kigaliInputToISO(v.endTime) : null,
      gallery: v.gallery,
      organiser: v.organiser,
      maxAttendees: v.maxAttendees,
      details: v.details,
      rules: v.rules,
      price: v.price,
      location: v.location,
      isPublished: v.isPublished,
      status: v.status,
    };
    await update.mutateAsync({ id, body });
    router.push(`/admin/events/${id}`);
  }

  return (
    <div className="mx-auto">
      <PageHeader
        title="Edit event"
        crumbs={[
          { label: "Events", href: "/admin/events" },
          { label: event.name, href: `/admin/events/${id}` },
          { label: "Edit" },
        ]}
      />
      <Card className="shadow-none">
        <CardContent className="pt-6">
          <EventForm
            mode="edit"
            defaultValues={defaults}
            submitting={update.isPending}
            onSubmit={onSubmit}
            onCancel={() => router.push(`/admin/events/${id}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
