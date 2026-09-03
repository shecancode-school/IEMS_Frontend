"use client";

import type { UseFormReturn } from "react-hook-form";
import { ADMIN_ROLES, ROLE_LABELS, ROLE_CAPABILITIES, type AdminRole } from "@/types/admin";
import type { StaffCreateValues, StaffEditValues } from "@/schemas/admin";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
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
import { Switch } from "@/components/ui/switch";

/* One-line plain-English summary per role, so whoever is assigning it doesn't
   have to reason about the capability matrix. */
const ROLE_HINTS: Record<AdminRole, string> = {
  ADMIN: "Full console — events, participants, tickets, staff and the whole calendar.",
  CEO: "Full console, same reach as an administrator.",
  FACILITATOR: "Runs events and participants, plus their own schedule and bookings.",
  ACADEMIC: "Calendar only — own activities, bookings and the whole org schedule.",
  STAFF: "Calendar only — own activities and bookings.",
};

/* The create and edit forms differ (one has email + required password, the
   other has active + optional password) but share these four fields. Both are
   narrowed to the common shape here — react-hook-form's generics are invariant,
   so a shared component has to pick one concrete value type. */
type SharedStaffFields = {
  name: string;
  role: AdminRole;
  title?: string | null;
  bio?: string | null;
  canScan?: boolean;
};

export function StaffFields({
  form,
}: {
  form: UseFormReturn<StaffCreateValues> | UseFormReturn<StaffEditValues>;
}) {
  const f = form as unknown as UseFormReturn<SharedStaffFields>;
  const control = f.control;
  const role = f.watch("role");

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          control={control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input placeholder="Aline Uwase" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ADMIN_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                {role ? ROLE_HINTS[role] : "Decides what they can reach in the console."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Title</FormLabel>
            <FormControl>
              <Input
                placeholder="Lead Facilitator, SheCanCODE"
                {...field}
                value={field.value ?? ""}
              />
            </FormControl>
            <FormDescription>
              Shown on the org calendar and on their public booking page.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="bio"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Short bio</FormLabel>
            <FormControl>
              <Textarea
                rows={3}
                placeholder="What people can book time with them about."
                {...field}
                value={field.value ?? ""}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="canScan"
        render={({ field }) => (
          <FormItem className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <FormLabel>Gate scanner</FormLabel>
              <FormDescription>
                Lets them operate the gate scanner from their own device — no separate
                scanner account needed.
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={field.value ?? false}
                onCheckedChange={(v) => field.onChange(v)}
              />
            </FormControl>
          </FormItem>
        )}
      />

      {role && (
        <div className="rounded-lg border bg-muted/40 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            {ROLE_LABELS[role]} can:
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {ROLE_CAPABILITIES[role].map((c) => (
              <li
                key={c}
                className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
