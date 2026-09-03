"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useStaffMember, useUpdateStaff } from "@/hooks/admin/staff";
import { staffEditSchema, type StaffEditValues } from "@/schemas/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { StaffFields } from "@/components/admin/StaffForm";
import { ErrorState, TableSkeleton } from "@/components/admin/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export default function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, isPending, error, refetch } = useStaffMember(id);
  const update = useUpdateStaff();

  if (isPending) return <TableSkeleton cols={2} />;
  if (error) return <ErrorState message={error.message} onRetry={() => refetch()} />;
  if (!data) return <ErrorState message="Staff account not found" />;

  return <EditForm key={data.id} staff={data} onDone={() => router.push("/admin/staff")} update={update} />;
}

function EditForm({
  staff,
  onDone,
  update,
}: {
  staff: { id: string; name: string; email: string; role: StaffEditValues["role"]; title: string | null; bio: string | null; active: boolean; canScan: boolean };
  onDone: () => void;
  update: ReturnType<typeof useUpdateStaff>;
}) {
  const form = useForm<StaffEditValues>({
    resolver: zodResolver(staffEditSchema),
    defaultValues: {
      name: staff.name,
      role: staff.role,
      active: staff.active,
      title: staff.title ?? "",
      bio: staff.bio ?? "",
      canScan: staff.canScan,
      password: "",
    },
  });

  async function onSubmit(v: StaffEditValues) {
    /* an empty password field means "leave it alone", not "set it to blank" */
    const { password, ...rest } = v;
    await update.mutateAsync({ id: staff.id, body: password ? v : (rest as StaffEditValues) });
    onDone();
  }

  return (
    <div className="w-full">
      <PageHeader
        title={staff.name}
        description={staff.email}
        crumbs={[{ label: "Staff", href: "/admin/staff" }, { label: "Edit" }]}
      />
      <Card className="w-full shadow-none">
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <StaffFields form={form} />

              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>Active</FormLabel>
                      <FormDescription>
                        Turning this off ends their session on the next request.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormDescription>Leave blank to keep their current password.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onDone}>
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
