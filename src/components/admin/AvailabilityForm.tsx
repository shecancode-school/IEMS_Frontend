"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAvailability, useSaveAvailability } from "@/hooks/admin/availability";
import { useGoogleStatus } from "@/hooks/admin/google";
import type { AvailabilityView } from "@/services/admin";
import { appUrl } from "@/lib/appUrl";
import { ErrorState, TableSkeleton } from "@/components/admin/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DAYS = [
  { weekday: 1, label: "Monday" },
  { weekday: 2, label: "Tuesday" },
  { weekday: 3, label: "Wednesday" },
  { weekday: 4, label: "Thursday" },
  { weekday: 5, label: "Friday" },
  { weekday: 6, label: "Saturday" },
  { weekday: 0, label: "Sunday" },
];

const LEAD_OPTIONS = [
  { value: 0, label: "No notice needed" },
  { value: 120, label: "2 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "1 day" },
  { value: 2880, label: "2 days" },
];

export function AvailabilityForm() {
  const { data, isPending, error, refetch } = useAvailability();
  const { data: google } = useGoogleStatus();
  const save = useSaveAvailability();
  const [form, setForm] = useState<AvailabilityView | null>(null);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  if (isPending || !form) return <TableSkeleton cols={2} />;
  if (error) return <ErrorState message={error.message} onRetry={() => refetch()} />;

  const set = <K extends keyof AvailabilityView>(key: K, value: AvailabilityView[K]) =>
    setForm({ ...form, [key]: value });

  const rowsFor = (weekday: number) => form.weekly.filter((w) => w.weekday === weekday);

  const addRow = (weekday: number) =>
    set("weekly", [...form.weekly, { weekday, start: "09:00", end: "17:00" }]);

  const updateRow = (index: number, patch: Partial<{ start: string; end: string }>) =>
    set(
      "weekly",
      form.weekly.map((w, i) => (i === index ? { ...w, ...patch } : w))
    );

  const removeRow = (index: number) =>
    set("weekly", form.weekly.filter((_, i) => i !== index));

  const publicUrl = appUrl(`/book/${form.slug}`);
  const noHours = form.weekly.length === 0;

  return (
    <div className="space-y-5">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Let people book you</CardTitle>
          <CardDescription>
            When this is on, anyone with your link can book a slot from the hours below. Your
            Google calendar is checked first, so a time you are already busy is never offered.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="bookable">Accept bookings</Label>
              <p className="text-sm text-muted-foreground">
                {form.bookable ? "Your page is live." : "Your page is hidden."}
              </p>
            </div>
            <Switch
              id="bookable"
              checked={form.bookable}
              onCheckedChange={(v) => set("bookable", v)}
            />
          </div>

          {form.bookable && noHours && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Add at least one block of weekly hours below, or your page will never have a slot
              to offer.
            </p>
          )}

          {form.bookable && google && !google.connected && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Your Google Calendar is not connected, so bookings will not check your real
              commitments and will not include a Meet link.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="slug">Your booking link</Label>
              <div className="flex gap-2">
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) => set("slug", e.target.value.toLowerCase())}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Copy link"
                  onClick={() => {
                    void navigator.clipboard.writeText(publicUrl);
                    toast.success("Link copied");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <Link2 className="size-3 shrink-0" />
                {publicUrl}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="headline">Headline</Label>
              <Input
                id="headline"
                placeholder="Lead Facilitator, SheCanCODE"
                value={form.headline}
                onChange={(e) => set("headline", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bio">What people can book you for</Label>
            <Textarea
              id="bio"
              rows={3}
              placeholder="Career questions, code review, project feedback…"
              value={form.bio}
              onChange={(e) => set("bio", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Weekly hours</CardTitle>
          <CardDescription>
            Kigali time. Add two blocks on a day to keep a lunch break out of the bookable hours.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {DAYS.map((day) => {
            const rows = form.weekly
              .map((w, index) => ({ w, index }))
              .filter(({ w }) => w.weekday === day.weekday);
            return (
              <div key={day.weekday} className="flex flex-wrap items-start gap-3 border-b pb-3 last:border-0">
                <p className="w-24 shrink-0 pt-2 text-sm font-medium">{day.label}</p>
                <div className="flex flex-1 flex-wrap gap-2">
                  {rows.length === 0 && (
                    <p className="pt-2 text-sm text-muted-foreground">Not available</p>
                  )}
                  {rows.map(({ w, index }) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <Input
                        type="time"
                        className="w-32"
                        value={w.start}
                        onChange={(e) => updateRow(index, { start: e.target.value })}
                      />
                      <span className="text-muted-foreground">to</span>
                      <Input
                        type="time"
                        className="w-32"
                        value={w.end}
                        onChange={(e) => updateRow(index, { end: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Remove ${day.label} block`}
                        onClick={() => removeRow(index)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => addRow(day.weekday)}>
                  <Plus className="size-4" />
                  Add
                </Button>
              </div>
            );
          })}
          {rowsFor(0).length === 0 && rowsFor(6).length === 0 && (
            <p className="text-xs text-muted-foreground">
              Weekends are closed unless you add hours to them.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Meeting rules</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Meeting length"
            suffix="minutes"
            value={form.slotMinutes}
            min={5}
            max={480}
            onChange={(v) => set("slotMinutes", v)}
          />
          <NumberField
            label="Gap between meetings"
            suffix="minutes"
            hint="Protected time either side of a booking, so calls never run into each other."
            value={form.bufferMinutes}
            min={0}
            max={240}
            onChange={(v) => set("bufferMinutes", v)}
          />
          <div className="space-y-1.5">
            <Label htmlFor="lead">Minimum notice</Label>
            <select
              id="lead"
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              value={form.leadTimeMinutes}
              onChange={(e) => set("leadTimeMinutes", Number(e.target.value))}
            >
              {LEAD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Stops someone booking you ten minutes from now.
            </p>
          </div>
          <NumberField
            label="How far ahead people can book"
            suffix="days"
            value={form.horizonDays}
            min={1}
            max={365}
            onChange={(v) => set("horizonDays", v)}
          />
          <NumberField
            label="Most meetings per day"
            suffix="0 = no limit"
            value={form.maxPerDay}
            min={0}
            max={50}
            onChange={(v) => set("maxPerDay", v)}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setForm(data ?? null)}>
          Reset
        </Button>
        <Button
          onClick={() => save.mutate(form)}
          disabled={save.isPending || (form.bookable && noHours)}
        >
          {save.isPending ? "Saving…" : "Save availability"}
        </Button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
  hint?: string;
}) {
  const id = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          className="w-28"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
