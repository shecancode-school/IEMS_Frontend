"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useGuest, useUpdateGuest } from "@/hooks/admin/guests";
import { guestEditSchema, type GuestEditValues } from "@/schemas/admin";
import { GUEST_TYPES } from "@/types/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { TableSkeleton, EmptyState } from "@/components/admin/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
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

export default function EditGuestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isPending } = useGuest(id);
  const update = useUpdateGuest();
  const form = useForm<GuestEditValues>({ resolver: zodResolver(guestEditSchema) });

  const g = data?.guest;
  useEffect(() => {
    if (g) form.reset({ name: g.name, email: g.email, guestType: g.guestType });
  }, [g, form]);

  if (isPending) return <TableSkeleton rows={3} cols={2} />;
  if (!g) return <EmptyState title="Guest not found" />;

  async function onSubmit(v: GuestEditValues) {
    await update.mutateAsync({ id, body: v });
    router.push(`/admin/guests/${id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Edit guest"
        crumbs={[
          { label: "Guests", href: "/admin/guests" },
          { label: g.name, href: `/admin/guests/${id}` },
          { label: "Edit" },
        ]}
      />
      <Card className="shadow-none">
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full name</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="guestType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Guest type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full sm:w-60">
                          <SelectValue placeholder="Choose" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {GUEST_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push(`/admin/guests/${id}`)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={update.isPending}>
                  {update.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
