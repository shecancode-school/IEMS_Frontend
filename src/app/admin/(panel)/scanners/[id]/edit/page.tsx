"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useScanner, useUpdateScanner } from "@/hooks/admin/scanners";
import { scannerEditSchema, type ScannerEditValues } from "@/schemas/admin";
import { PageHeader } from "@/components/admin/PageHeader";
import { TableSkeleton, EmptyState } from "@/components/admin/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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

export default function EditScannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: scanner, isPending } = useScanner(id);
  const update = useUpdateScanner();
  const form = useForm<ScannerEditValues>({
    resolver: zodResolver(scannerEditSchema),
    defaultValues: { name: "", active: true, password: "" },
  });

  useEffect(() => {
    if (scanner) form.reset({ name: scanner.name, active: scanner.active, password: "" });
  }, [scanner, form]);

  if (isPending) return <TableSkeleton rows={3} cols={2} />;
  if (!scanner) return <EmptyState title="Scanner not found" />;

  async function onSubmit(v: ScannerEditValues) {
    await update.mutateAsync({ id, body: { ...v, password: v.password || undefined } });
    router.push("/admin/scanners");
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="Edit scanner"
        crumbs={[{ label: "Scanners", href: "/admin/scanners" }, { label: scanner.name }]}
      />
      <Card className="shadow-none">
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
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
                      <Input type="password" placeholder="Leave blank to keep" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormDescription>Only set this to reset the password.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div>
                      <FormLabel>Active</FormLabel>
                      <FormDescription>Disabled scanners can&apos;t sign in.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => router.push("/admin/scanners")}>
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
