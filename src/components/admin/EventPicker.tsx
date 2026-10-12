"use client";

import { useEvents } from "@/hooks/admin/events";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* Reusable event selector for create forms and filters. */
export function EventPicker({
  value,
  onValueChange,
  placeholder = "Choose an event",
  className,
  includeAll,
}: {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  includeAll?: boolean;
}) {
  const { data: events } = useEvents();
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="all">All events</SelectItem>}
        {(events ?? []).map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
