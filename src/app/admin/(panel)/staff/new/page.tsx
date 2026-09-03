"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateStaff } from "@/hooks/admin/staff";
import { staffCreateSchema, type StaffCreateValues } from "@/schemas/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { StaffFields } from "@/components/admin/StaffForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export default function NewStaffPage() {
  const router = useRouter();
  const create = useCreateStaff();
  const form = useForm<StaffCreateValues>({
    resolver: zodResolver(staffCreateSchema),
    defaultValues: { name: "", email: "", password: "", role: "STAFF", title: "", bio: "", canScan: false },
  });

  async function onSubmit(v: StaffCreateValues) {
    await create.mutateAsync(v);
    router.push("/admin/staff");
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Add staff"
        crumbs={[{ label: "Staff", href: "/admin/staff" }, { label: "New" }]}
      />
      <Card className="w-full shadow-none">
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <StaffFields form={form} />

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="aline@igirerwanda.org" {...field} />
                      </FormControl>
                      <FormDescription>
                        Their console sign-in. They connect their own Google account separately.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Temporary password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormDescription>At least 8 characters.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => router.push("/admin/staff")}>
                  Cancel
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Saving…" : "Create account"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
