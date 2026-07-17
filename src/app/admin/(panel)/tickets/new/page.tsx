"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Ticket as TicketIcon } from "lucide-react";
import { useParticipants } from "@/hooks/admin/participants";
import { useGuests } from "@/hooks/admin/guests";
import { useGenerateTicket } from "@/hooks/admin/tickets";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

type Option = { id: string; label: string; sub: string };

function HolderCombobox({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: Option[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  return (
    <>
      <Button
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className="w-full justify-between font-normal"
        onClick={() => setOpen(true)}
      >
        {selected ? (
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate">{selected.label}</span>
            <span className="truncate text-xs text-muted-foreground">{selected.sub}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={placeholder}
        description="Search by name, email or event"
        className="top-1/2 left-1/2 -translate-y-1/2 border border-white/10 bg-neutral-950 text-neutral-50 ring-0 shadow-2xl sm:max-w-2xl"
      >
        <Command className="bg-neutral-950 text-neutral-50">
          <CommandInput placeholder="Search by name, email or event…" />
          <CommandList className="max-h-80">
            <CommandEmpty className="py-6 text-center text-sm text-neutral-400">
              No matches.
            </CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.label} ${o.sub}`}
                  className="data-selected:bg-white/10 data-selected:text-white"
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", value === o.id ? "opacity-100" : "opacity-0")} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-neutral-50">{o.label}</span>
                    <span className="truncate text-xs text-neutral-400">{o.sub}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}

export default function GenerateTicketPage() {
  const router = useRouter();
  const generate = useGenerateTicket();
  const participants = useParticipants();
  const guests = useGuests();
  const [participantId, setParticipantId] = useState("");
  const [guestId, setGuestId] = useState("");

  const pOptions: Option[] = (participants.data ?? [])
    .filter((p) => p.registrationStatus)
    .map((p) => ({ id: p.id, label: p.name, sub: `${p.email} · ${p.event?.name ?? ""}` }));
  const gOptions: Option[] = (guests.data ?? []).map((g) => ({
    id: g.id,
    label: g.name,
    sub: `${g.email} · ${g.eventName ?? ""}`,
  }));

  async function submit(kind: "participant" | "guest") {
    const body = kind === "participant" ? { participantId } : { guestId };
    await generate.mutateAsync(body);
    router.push("/admin/tickets");
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeader
        title="Generate ticket"
        description="Issue a pass for a participant or guest the QR is emailed to them."
        crumbs={[{ label: "Tickets", href: "/admin/tickets" }, { label: "Generate" }]}
      />
      <Card className="shadow-none">
        <CardContent className="pt-6">
          <Tabs defaultValue="participant">
            <TabsList className="mb-5 grid w-full grid-cols-2">
              <TabsTrigger value="participant">Participant</TabsTrigger>
              <TabsTrigger value="guest">Guest</TabsTrigger>
            </TabsList>

            <TabsContent value="participant" className="space-y-4">
              <div className="space-y-2">
                <Label>Participant</Label>
                <HolderCombobox
                  options={pOptions}
                  value={participantId}
                  onChange={setParticipantId}
                  placeholder="Choose a participant"
                />
              </div>
              <Button
                className="w-full"
                disabled={!participantId || generate.isPending}
                onClick={() => submit("participant")}
              >
                <TicketIcon className="size-4" />
                {generate.isPending ? "Generating…" : "Generate ticket"}
              </Button>
            </TabsContent>

            <TabsContent value="guest" className="space-y-4">
              <div className="space-y-2">
                <Label>Guest</Label>
                <HolderCombobox
                  options={gOptions}
                  value={guestId}
                  onChange={setGuestId}
                  placeholder="Choose a guest"
                />
              </div>
              <Button
                className="w-full"
                disabled={!guestId || generate.isPending}
                onClick={() => submit("guest")}
              >
                <TicketIcon className="size-4" />
                {generate.isPending ? "Generating…" : "Generate ticket"}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
