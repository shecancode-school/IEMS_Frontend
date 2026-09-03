"use client";

import { useRef, type ComponentProps, type ElementType, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarDays,
  CircleDot,
  Clock,
  Link2,
  MapPin,
  MapPinned,
  Users,
  Video,
  UserRound,
  Building2,
  Ticket,
  FileText,
  Image as ImageIcon,
  Info,
  Settings2,
  Shapes,
  Tag,
  Type,
  CheckCircle2,
  Plus,
  Trash2,
  Globe2,
} from "lucide-react";

import {
  eventFormSchema,
  type EventFormInput,
  type EventFormValues,
} from "@/schemas/admin";

import {
  EVENT_CATEGORIES,
  EVENT_TYPES,
  EVENT_STATUSES,
} from "@/types/admin";

import { useCalendarPeople } from "@/hooks/admin/calendar";
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
  mode: "IN_PERSON",
  host: "",
  isPublished: false,
  status: "DRAFT",
};

/*
 * Shared control styling.
 *
 * The previous implementation relied mainly on rounded-xl.
 * These controls now have:
 * - stronger borders
 * - better contrast
 * - consistent height
 * - clearer focus state
 * - subtle shadow
 */
const CONTROL = cn(
  "h-11 rounded-xl",
  "border-border bg-background",
  "px-3.5 text-sm",
  "shadow-sm",
  "transition-all duration-200",
  "placeholder:text-muted-foreground/60",
  "hover:border-foreground/20",
  "focus-visible:border-primary",
  "focus-visible:ring-2",
  "focus-visible:ring-primary/20"
);

const ICON_CONTROL = cn(CONTROL, "pl-10");

/* Native date, time and number inputs draw their own controls — a calendar
   glyph, a clock, a pair of spinners — always on the right, in the browser's
   own styling, and impossible to bring in line with the rest of the form. They
   are switched off here and replaced with affordances this form owns. */
const NATIVE_PICKER_OFF =
  "[&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden";
const NATIVE_SPINNER_OFF =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/* One input, one icon, one implementation.

   Five fields each carried their own copy of the relative-wrapper-plus-
   absolutely-positioned-icon markup, which is precisely how the date pair came
   to have the 40px of icon padding and no icon in it: the pattern lived in five
   places, and drifted in one. */
function FieldInput({
  icon: Icon,
  className,
  ...props
}: ComponentProps<typeof Input> & { icon: ElementType }) {
  return (
    <div className="relative">
      <Icon
        aria-hidden
        className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input className={cn(ICON_CONTROL, className)} {...props} />
    </div>
  );
}

/* The leading icon inside a Select trigger. Every control on this form now
   opens with one, so the eye can run down a column of fields and find the
   values in the same place each time instead of stepping around the four that
   happened to have an icon and the four that did not. */
function TriggerIcon({ icon: Icon }: { icon: ElementType }) {
  return <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />;
}

/* -------------------------------------------------------------------------- */
/* Section                                                                   */
/* -------------------------------------------------------------------------- */

function Section({
  title,
  description,
  icon: Icon,
  children,
  cols = 1,
}: {
  title: string;
  description?: string;
  icon?: React.ElementType;
  children: ReactNode;
  cols?: 1 | 2;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-primary shadow-sm">
              <Icon className="size-4" />
            </div>
          )}

          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
              {title}
            </h2>

            {description && (
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground sm:text-sm">
                {description}
              </p>
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "grid gap-5 p-5 sm:p-6",
          cols === 2 && "sm:grid-cols-2"
        )}
      >
        {children}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Field helper                                                               */
/* -------------------------------------------------------------------------- */

/* Every field on this form is required except one, so the marker goes on by
   default and `optional` is the exception you have to ask for. The asterisk is
   a real character with an accessible name rather than a red glyph a screen
   reader reads as "star". */
function FieldLabel({
  children,
  optional = false,
}: {
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <FormLabel className="text-sm font-medium text-foreground">
      {children}

      {optional ? (
        <span className="ml-1.5 font-normal text-muted-foreground">(optional)</span>
      ) : (
        <span className="ml-1 text-destructive" aria-label="required" title="Required">
          *
        </span>
      )}
    </FormLabel>
  );
}

/* -------------------------------------------------------------------------- */
/* Date / time                                                                */
/* -------------------------------------------------------------------------- */

function DateTimeField({
  value,
  onChange,
  onBlur,
  label,
  minDate,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** names the pair for screen readers — "Starts date", "Starts time" */
  label: string;
  /** the start's day, so the end picker cannot offer an earlier one */
  minDate?: string;
  invalid?: boolean;
}) {
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const [date = "", time = ""] = (value || "").split("T");

  const commit = (nextDate: string, nextTime: string) => {
    /* Clearing the date clears the field: a time with no day is not a moment,
       and keeping it would leave a value the schema cannot parse. */
    if (!nextDate) {
      onChange("");
      return;
    }
    onChange(`${nextDate}T${nextTime || "09:00"}`);
  };

  /* The icon is the picker.

     A native date input already draws a calendar glyph and a time input a
     clock — both on the right, both in the browser's own styling. Putting our
     own on the left as well printed the same symbol twice in one 200px
     control. So the native ones are hidden and ours takes over their job: it
     is a real button that calls showPicker(), which keeps the affordance,
     moves it into line with every other field on the form, and leaves typing
     into the input untouched.

     showPicker() is guarded rather than feature-detected. It throws on a
     browser that does not have it and on a call the browser does not consider
     user-initiated, and in both cases the answer is the same — the field is
     still a working date input you can type into. */
  const openPicker = (input: HTMLInputElement | null) => {
    try {
      input?.showPicker();
    } catch {
      input?.focus();
    }
  };

  return (
    <div className="grid gap-3 sm:grid-cols-[1.35fr_1fr]">
      <div className="relative">
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Choose ${label.toLowerCase()} date`}
          onClick={() => openPicker(dateRef.current)}
          className="absolute left-0 top-0 z-10 flex h-full w-10 items-center justify-center rounded-l-xl text-muted-foreground transition-colors hover:text-foreground"
        >
          <CalendarDays className="size-4" />
        </button>

        <Input
          ref={dateRef}
          type="date"
          aria-label={`${label} date`}
          aria-invalid={invalid}
          className={cn(ICON_CONTROL, NATIVE_PICKER_OFF)}
          value={date}
          min={minDate}
          onBlur={onBlur}
          onChange={(event) => commit(event.target.value, time)}
        />
      </div>

      <div className="relative">
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Choose ${label.toLowerCase()} time`}
          onClick={() => openPicker(timeRef.current)}
          className="absolute left-0 top-0 z-10 flex h-full w-10 items-center justify-center rounded-l-xl text-muted-foreground transition-colors hover:text-foreground"
        >
          <Clock className="size-4" />
        </button>

        <Input
          ref={timeRef}
          type="time"
          aria-label={`${label} time`}
          aria-invalid={invalid}
          className={cn(ICON_CONTROL, NATIVE_PICKER_OFF)}
          value={time}
          onBlur={onBlur}
          onChange={(event) => commit(date, event.target.value)}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Attendance mode                                                            */
/* -------------------------------------------------------------------------- */

function AttendanceModeIcon({ mode }: { mode?: string }) {
  if (mode === "ONLINE") {
    return <Video className="size-4" />;
  }

  if (mode === "HYBRID") {
    return <Globe2 className="size-4" />;
  }

  return <MapPin className="size-4" />;
}

/* -------------------------------------------------------------------------- */
/* Main form                                                                  */
/* -------------------------------------------------------------------------- */

export function EventForm({
  mode,
  defaultValues,
  submitting,
  onSubmit,
  onCancel,
}: EventFormProps) {
  const { data: people } = useCalendarPeople();

  const form = useForm<EventFormInput, unknown, EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    /* Re-validate as soon as a field has been touched once. The default
       ("onSubmit") means a form this long tells you nothing until you press
       the button at the very bottom, then reports six problems at once. */
    mode: "onTouched",
    defaultValues: {
      ...BASE,
      ...defaultValues,
    },
  });

  const submit = form.handleSubmit(
    (values) =>
      onSubmit({
        ...values,
        rules: values.rules.map((rule) => rule.trim()).filter(Boolean),
      }),
    /* The failure path matters as much as the success one. The submit button
       sits in a sticky bar at the bottom of a form several screens tall, so an
       invalid field is usually scrolled out of sight — pressing Save appeared
       to do nothing at all.

       The first rendered error message is the target, not the first key in the
       errors object: half the fields here are custom components (the date
       pair, the rich-text editor, the image uploader, the Selects) with no
       `name` attribute in the DOM, so a `[name=...]` lookup would find nothing
       for exactly the fields most likely to be wrong. Every one of them does
       render a FormMessage. A frame is allowed to pass first so the messages
       that were just added are actually in the document. */
    () => {
      requestAnimationFrame(() => {
        const message = document.querySelector<HTMLElement>('[data-slot="form-message"]');
        const item = message?.closest<HTMLElement>('[data-slot="form-item"]') ?? message;
        item?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
  );

  /* useWatch rather than form.watch(): watch() returns a fresh function on
     every render, which the React Compiler cannot memoise — it was skipping
     compilation of this whole component and saying so in the lint output. */
  const isPublished = useWatch({ control: form.control, name: "isPublished" });
  const attendanceMode = useWatch({ control: form.control, name: "mode" });
  const startTime = useWatch({ control: form.control, name: "startTime" });
  /* the day the event starts, so the end picker cannot offer an earlier one */
  const startDay = (startTime ?? "").split("T")[0] || undefined;

  const errorCount = Object.keys(form.formState.errors).length;

  return (
    <Form {...form}>
      {/* noValidate: the browser's own bubbles would fire first and compete
          with the messages under each field, and they cannot be styled or
          read by the same screen-reader path. Zod is the single validator. */}
      <form onSubmit={submit} noValidate className="relative">
        <div className="mx-auto w-full max-w-5xl space-y-6 pb-28">

          {/* A status strip, not a hero.

              What stood here was a full-height card whose entire contents —
              title, subtitle, icon — were commented out, leaving a 100px band
              of blurred gradient wrapped around a single Draft pill. The pill
              is the only thing that was earning its space, so it keeps the
              space and the card is gone. The page title is the PageHeader's
              job, one level up, and it was already printing it. */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
            <div
              className={cn(
                "flex w-fit items-center gap-2 text-xs font-medium",
                isPublished ? "text-primary" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  isPublished ? "bg-primary" : "bg-muted-foreground/40"
                )}
              />
              {isPublished ? "Published — visible on the public site" : "Draft — not public"}
            </div>

            <p className="text-xs text-muted-foreground">
              Fields marked <span className="text-destructive">*</span> are required
            </p>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Basics                                                           */}
          {/* ---------------------------------------------------------------- */}

          <Section
            title="Basics"
            description="Give your event a clear identity and classify it for attendees."
            icon={Info}
            cols={2}
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FieldLabel>Event name</FieldLabel>

                  <FormControl>
                    <FieldInput
                      icon={Type}
                      placeholder="Women in Tech Night"
                      /* still the tallest control on the form — the size
                         carries the hierarchy, the icon carries the alignment */
                      className="h-12 text-base"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>

                  <FormDescription>
                    Use a short, descriptive name that attendees can easily
                    recognize.
                  </FormDescription>

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
                    <FieldLabel>Event URL</FieldLabel>

                    <FormControl>
                      <div className="flex h-11 overflow-hidden rounded-xl border border-border bg-background shadow-sm transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                        <div className="flex shrink-0 items-center gap-2 border-r border-border bg-muted/40 px-3.5 text-sm text-muted-foreground">
                          <Link2 className="size-4" />
                          <span>/events/</span>
                        </div>

                        <input
                          {...field}
                          placeholder="women-in-tech-night"
                          className="min-w-0 flex-1 bg-transparent px-3.5 text-sm outline-none placeholder:text-muted-foreground/60"
                        />
                      </div>
                    </FormControl>

                    <FormDescription>
                      Lowercase and hyphenated. This cannot be changed later.
                    </FormDescription>

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
                  <FieldLabel>Category</FieldLabel>

                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className={cn("w-full", CONTROL)}>
                        <div className="flex items-center gap-2">
                          <TriggerIcon icon={Tag} />
                          <SelectValue placeholder="Select category" />
                        </div>
                      </SelectTrigger>
                    </FormControl>

                    <SelectContent>
                      {EVENT_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
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
                  <FieldLabel>Event type</FieldLabel>

                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className={cn("w-full", CONTROL)}>
                        <div className="flex items-center gap-2">
                          <TriggerIcon icon={Shapes} />
                          <SelectValue placeholder="Select type" />
                        </div>
                      </SelectTrigger>
                    </FormControl>

                    <SelectContent>
                      {EVENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.charAt(0) + type.slice(1).toLowerCase()}
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
                  <FormItem className="sm:col-span-2">
                    <FieldLabel>Registration status</FieldLabel>

                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger className={cn("w-full", CONTROL)}>
                          <div className="flex items-center gap-2">
                            <TriggerIcon icon={CircleDot} />
                            <SelectValue placeholder="Select status" />
                          </div>
                        </SelectTrigger>
                      </FormControl>

                      <SelectContent>
                        {EVENT_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
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

          {/* ---------------------------------------------------------------- */}
          {/* Date & Time                                                      */}
          {/* ---------------------------------------------------------------- */}

          <Section
            title="Date & time"
            description="Set when the event starts and ends. Times are interpreted as Kigali time (GMT+2)."
            icon={CalendarDays}
            cols={2}
          >
            <FormField
              control={form.control}
              name="startTime"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FieldLabel>Starts</FieldLabel>

                  <FormControl>
                    <DateTimeField
                      label="Starts"
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      invalid={Boolean(fieldState.error)}
                    />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endTime"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FieldLabel>Ends</FieldLabel>

                  <FormControl>
                    <DateTimeField
                      label="Ends"
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      minDate={startDay}
                      invalid={Boolean(fieldState.error)}
                    />
                  </FormControl>

                  <FormDescription>
                    Must be after the start. Shown on the public event card and on
                    every attendee&apos;s pass.
                  </FormDescription>

                  <FormMessage />
                </FormItem>
              )}
            />
          </Section>

          {/* ---------------------------------------------------------------- */}
          {/* Location                                                         */}
          {/* ---------------------------------------------------------------- */}

          <Section
            title="Location & attendance"
            description="Configure where the event happens, how attendees join, and who is responsible for hosting it."
            icon={MapPinned}
            cols={2}
          >
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FieldLabel>Location</FieldLabel>

                  <FormControl>
                    <FieldInput
                      icon={MapPin}
                      placeholder="Main Hall, Kigali"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="mode"
              render={({ field }) => (
                <FormItem>
                  <FieldLabel>Attendance mode</FieldLabel>

                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className={cn("w-full", CONTROL)}>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <AttendanceModeIcon mode={attendanceMode} />
                          <span className="text-foreground">
                            <SelectValue placeholder="Select attendance mode" />
                          </span>
                        </div>
                      </SelectTrigger>
                    </FormControl>

                    <SelectContent>
                      <SelectItem value="IN_PERSON">
                        <div className="flex items-center gap-2">
                          <MapPin className="size-4" />
                          In person
                        </div>
                      </SelectItem>

                      <SelectItem value="ONLINE">
                        <div className="flex items-center gap-2">
                          <Video className="size-4" />
                          Online
                        </div>
                      </SelectItem>

                      <SelectItem value="HYBRID">
                        <div className="flex items-center gap-2">
                          <Globe2 className="size-4" />
                          Hybrid
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <FormDescription>
                    Online and hybrid events can receive a Google Meet link
                    through the host&apos;s calendar.
                  </FormDescription>

                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="host"
              render={({ field }) => (
                <FormItem>
                  <FieldLabel optional>Host</FieldLabel>

                  <Select
                    value={field.value ?? "none"}
                    onValueChange={(value) =>
                      field.onChange(value === "none" ? "" : value)
                    }
                  >
                    <FormControl>
                      <SelectTrigger className={cn("w-full", CONTROL)}>
                        <div className="flex items-center gap-2">
                          <TriggerIcon icon={UserRound} />
                          <SelectValue placeholder="Nobody in particular" />
                        </div>
                      </SelectTrigger>
                    </FormControl>

                    <SelectContent>
                      <SelectItem value="none">
                        Nobody in particular
                      </SelectItem>

                      {(people ?? []).map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name}
                          {person.googleConnected
                            ? ""
                            : " (no Google Calendar)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <FormDescription>
                    The host is used for calendar placement and Google Meet
                    creation.
                  </FormDescription>

                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="organiser"
              render={({ field }) => (
                <FormItem>
                  <FieldLabel>Organiser</FieldLabel>

                  <FormControl>
                    <FieldInput
                      icon={Building2}
                      placeholder="Igire Rwanda Organization"
                      autoComplete="organization"
                      {...field}
                    />
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
                  <FieldLabel>Capacity</FieldLabel>

                  <FormControl>
                    <FieldInput
                      icon={Users}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className={NATIVE_SPINNER_OFF}
                      /* A number input changes its value on a scroll wheel
                         while focused. On a form this long that turns an
                         ordinary scroll past the field into a silent edit of
                         the event's capacity, so focus is dropped instead. */
                      onWheel={(event) => event.currentTarget.blur()}
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={String(field.value ?? "")}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>

                  <FormDescription>
                    Set to 0 for unlimited attendance.
                  </FormDescription>

                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FieldLabel>Price</FieldLabel>

                  <FormControl>
                    <FieldInput icon={Ticket} placeholder="Free" {...field} />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />
          </Section>

          {/* ---------------------------------------------------------------- */}
          {/* Details                                                          */}
          {/* ---------------------------------------------------------------- */}

          <Section
            title="Event details"
            description="Required. A sentence or two at minimum — this is what people read before deciding to come."
            icon={FileText}
          >
            <FormField
              control={form.control}
              name="details"
              render={({ field }) => (
                <FormItem>
                  <FieldLabel>Description</FieldLabel>

                  <FormControl>
                    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
                      <RichTextEditor
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="What is this event about? Include the agenda, target audience, speakers, and anything attendees should know…"
                      />
                    </div>
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />
          </Section>

          {/* ---------------------------------------------------------------- */}
          {/* Rules                                                            */}
          {/* ---------------------------------------------------------------- */}

          <Section
            title="Rules & regulations"
            description="Optional. Requirements or instructions that appear on the attendee's pass."
            icon={Settings2}
          >
            <FormField
              control={form.control}
              name="rules"
              render={({ field }) => {
                const rules: string[] = field.value ?? [];

                const setRule = (index: number, value: string) =>
                  field.onChange(
                    rules.map((rule, currentIndex) =>
                      currentIndex === index ? value : rule
                    )
                  );

                const addRule = () => field.onChange([...rules, ""]);

                const removeRule = (index: number) =>
                  field.onChange(
                    rules.filter(
                      (_, currentIndex) => currentIndex !== index
                    )
                  );

                return (
                  <FormItem>
                    {rules.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-5 py-10 text-center">
                        <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground shadow-sm">
                          <Settings2 className="size-5" />
                        </div>

                        <p className="mt-4 text-sm font-semibold text-foreground">
                          No rules added
                        </p>

                        <p className="mx-auto mt-1 max-w-md text-sm leading-5 text-muted-foreground">
                          Add requirements such as bringing an ID, arriving
                          early, or following venue guidelines.
                        </p>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-5 rounded-xl"
                          onClick={addRule}
                        >
                          <Plus className="mr-2 size-4" />
                          Add first rule
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {rules.map((rule, index) => (
                          <div
                            key={index}
                            className="group flex items-center gap-3 rounded-xl border border-border bg-background p-2 shadow-sm transition-colors hover:border-foreground/15"
                          >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
                              {index + 1}
                            </span>

                            <Input
                              value={rule}
                              placeholder="e.g. Bring a valid ID"
                              className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0"
                              onChange={(event) =>
                                setRule(index, event.target.value)
                              }
                            />

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-9 shrink-0 rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              aria-label={`Remove rule ${index + 1}`}
                              onClick={() => removeRule(index)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ))}

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={addRule}
                        >
                          <Plus className="mr-2 size-4" />
                          Add another rule
                        </Button>
                      </div>
                    )}

                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          </Section>

          {/* ---------------------------------------------------------------- */}
          {/* Images                                                           */}
          {/* ---------------------------------------------------------------- */}

          <Section
            title="Event images"
            description="Upload the event poster and supporting images. The first image is used as the primary event poster."
            icon={ImageIcon}
          >
            <FormField
              control={form.control}
              name="gallery"
              render={({ field }) => (
                <FormItem>
                  <FieldLabel>Images</FieldLabel>

                  <FormControl>
                    <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-3">
                      <ImageUploader
                        value={field.value ?? []}
                        onChange={field.onChange}
                      />
                    </div>
                  </FormControl>

                  <FormDescription>
                    At least one image is required — the first is the event poster,
                    and it is what the public card, the event page and the emailed pass
                    all show. PNG or JPG, maximum 8MB each.
                  </FormDescription>

                  <FormMessage />
                </FormItem>
              )}
            />
          </Section>

          {/* ---------------------------------------------------------------- */}
          {/* Publish                                                           */}
          {/* ---------------------------------------------------------------- */}

          <FormField
            control={form.control}
            name="isPublished"
            render={({ field }) => (
              <FormItem
                className={cn(
                  "flex flex-col gap-5 rounded-2xl border p-5 shadow-sm transition-colors sm:flex-row sm:items-center sm:justify-between sm:p-6",
                  field.value
                    ? "border-primary/25 bg-primary/5"
                    : "border-border bg-card"
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl border",
                      field.value
                        ? "border-primary/20 bg-primary/10 text-primary"
                        : "border-border bg-muted/40 text-muted-foreground"
                    )}
                  >
                    {field.value ? (
                      <CheckCircle2 className="size-5" />
                    ) : (
                      <Globe2 className="size-5" />
                    )}
                  </div>

                  <div>
                    <FormLabel className="text-sm font-semibold">
                      Publish event
                    </FormLabel>

                    <FormDescription className="mt-1 max-w-xl text-sm leading-5">
                      {field.value
                        ? "This event is visible on the public calendar."
                        : "This event is saved as a draft and will not appear publicly."}
                    </FormDescription>
                  </div>
                </div>

                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-label="Publish event"
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Sticky actions                                                      */}
        {/* ------------------------------------------------------------------ */}

        <div className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-background/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            {/* What the bar says depends on whether the form can be saved.
                It used to read "Ready to publish" regardless — including while
                six required fields were empty and the button did nothing. */}
            <div className="min-w-0">
              {errorCount > 0 ? (
                <>
                  <p className="truncate text-sm font-medium text-destructive">
                    {errorCount === 1
                      ? "1 field needs attention"
                      : `${errorCount} fields need attention`}
                  </p>
                  <p className="hidden text-xs text-muted-foreground sm:block">
                    Saving scrolls to the first one.
                  </p>
                </>
              ) : (
                <>
                  <p className="hidden truncate text-sm font-medium text-foreground sm:block">
                    {isPublished ? "Ready to publish" : "Saved as draft"}
                  </p>
                  <p className="hidden text-xs text-muted-foreground sm:block">
                    Review your information before saving.
                  </p>
                </>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl px-4 sm:px-5"
                  onClick={onCancel}
                  disabled={submitting}
                >
                  Cancel
                </Button>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="h-10 rounded-xl px-5 shadow-sm sm:px-6"
              >
                {submitting
                  ? "Saving…"
                  : mode === "create"
                    ? "Create event"
                    : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
}

