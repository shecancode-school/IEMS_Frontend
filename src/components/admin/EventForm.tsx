"use client";

import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { eventFormSchema, type EventFormInput, type EventFormValues } from "@/schemas/admin";
import { EVENT_CATEGORIES, EVENT_TYPES, EVENT_STATUSES } from "@/types/admin";
import { CalendarDays, Clock, Link2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type EventFormProps = {
  mode: "create" | "edit";
  defaultValues?: Partial<EventFormInput>;
  submitting?: boolean;
  onSubmit: (values: EventFormValues) => void;
  onCancel?: () => void;
};

const BASE: EventFormInput = {
  name: "",
  slug: "",
  category: "Mentorship",
  type: "WORKSHOP",
  startTime: "",
  endTime: "",
  gallery: [],
  organiser: "Igire Rwanda Organization",
  maxAttendees: 0,
  details: "",
  rules: [],
  price: "Free",
  location: "",
  isPublished: false,
  status: "DRAFT",
};

/* consistent, evenly-rounded controls across the whole form (xl, never pills) */
const CONTROL = "rounded-xl";

/* a titled frame that groups related fields, so the form reads as sections
   instead of one long column */
function Section({
  title,
  description,
  children,
  cols = 1,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  cols?: 1 | 2;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="display text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className={cn("grid gap-5", cols === 2 && "sm:grid-cols-2")}>{children}</div>
    </section>
  );
}

/* Split the single datetime value into a distinct date picker and clock picker
   so each reads clearly — the date carries a calendar affordance, the time a
   clock. They stay backed by one `YYYY-MM-DDTHH:mm` string. */
function DateTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [date = "", time = ""] = (value || "").split("T");
  const commit = (d: string, t: string) => {
    if (!d) return onChange("");
    onChange(`${d}T${t || "09:00"}`);
  };
  return (
    <div className="grid grid-cols-[1.5fr_1fr] gap-2">
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="date"
          aria-label="Date"
          className={cn(CONTROL, "pl-9")}
          value={date}
          onChange={(e) => commit(e.target.value, time)}
        />
      </div>
      <div className="relative">
        <Clock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="time"
          aria-label="Time"
          className={cn(CONTROL, "pl-9")}
          value={time}
          onChange={(e) => commit(date, e.target.value)}
        />
      </div>
    </div>
  );
}

export function EventForm({ mode, defaultValues, submitting, onSubmit, onCancel }: EventFormProps) {
  const form = useForm<EventFormInput, unknown, EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: { ...BASE, ...defaultValues },
  });

  /* drop empty rule rows before handing the values up */
  const submit = form.handleSubmit((values) =>
    onSubmit({ ...values, rules: values.rules.map((r) => r.trim()).filter(Boolean) })
  );

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-6">
        <Section title="Basics" description="Name, address and how the event is classified." cols={2}>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Event name</FormLabel>
                <FormControl>
                  <Input placeholder="Women in Tech Night" className={CONTROL} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {mode === "create" && (
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <div className="flex items-stretch overflow-hidden rounded-xl border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
                      <span className="flex items-center gap-1.5 border-r border-input bg-muted/40 px-3 text-sm text-muted-foreground select-none">
                        <Link2 className="size-3.5" />
                        /events/
                      </span>
                      <input
                        {...field}
                        placeholder="women-in-tech-night"
                        className="h-8 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                  </FormControl>
                  <FormDescription>Lowercase, hyphenated. Can&apos;t change later.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className={cn("w-full", CONTROL)}>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {EVENT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className={cn("w-full", CONTROL)}>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.charAt(0) + t.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {mode === "edit" && (
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Registration status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className={cn("w-full", CONTROL)}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {EVENT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </Section>

        <Section title="Date & time" description="When the doors open and, optionally, close. Times are Kigali time (GMT+2)." cols={2}>
          <FormField
            control={form.control}
            name="startTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Starts</FormLabel>
                <FormControl>
                  <DateTimeField value={field.value ?? ""} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ends (optional)</FormLabel>
                <FormControl>
                  <DateTimeField value={field.value ?? ""} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </Section>

        <Section title="Location & capacity" description="Where it happens and how many can attend." cols={2}>
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <FormControl>
                  <Input placeholder="Main Hall, Kigali" className={CONTROL} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="organiser"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Organiser</FormLabel>
                <FormControl>
                  <Input className={CONTROL} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="maxAttendees"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Capacity</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    className={CONTROL}
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={String(field.value ?? "")}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
                <FormDescription>0 = uncapped.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Price</FormLabel>
                <FormControl>
                  <Input placeholder="Free" className={CONTROL} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </Section>

        <Section title="Details" description="Describe the event — use bold, italics and lists to keep it readable.">
          <FormField
            control={form.control}
            name="details"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <RichTextEditor
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    placeholder="What the session is about…"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </Section>

        <Section
          title="Rules & regulations"
          description="One rule per row — each gets its own line on the attendee's pass."
        >
          <FormField
            control={form.control}
            name="rules"
            render={({ field }) => {
              const rules: string[] = field.value ?? [];
              const setRule = (i: number, v: string) =>
                field.onChange(rules.map((r, idx) => (idx === i ? v : r)));
              const addRule = () => field.onChange([...rules, ""]);
              const removeRule = (i: number) => field.onChange(rules.filter((_, idx) => idx !== i));
              return (
                <FormItem>
                  <div className="space-y-2">
                    {rules.map((rule, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-5 shrink-0 text-center text-sm text-muted-foreground">
                          {i + 1}.
                        </span>
                        <Input
                          value={rule}
                          placeholder="e.g. Bring a valid ID"
                          className={CONTROL}
                          onChange={(e) => setRule(i, e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove rule"
                          onClick={() => removeRule(i)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={addRule}>
                      <Plus className="size-4" /> Add rule
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        </Section>

        <Section
          title="Event images"
          description="The first image is used as the event poster. PNG or JPG, up to 8MB each."
        >
          <FormField
            control={form.control}
            name="gallery"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <ImageUploader value={field.value ?? []} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </Section>

        <FormField
          control={form.control}
          name="isPublished"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
              <div>
                <FormLabel>Published</FormLabel>
                <FormDescription>Show this event on the public calendar.</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : mode === "create" ? "Create event" : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
