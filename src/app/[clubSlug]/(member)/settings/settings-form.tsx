"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ListEditor } from "@/components/list-editor";
import type { ClubSettings } from "@/lib/club";
import { updateSettings } from "./actions";

export function SettingsForm({
  name: initialName,
  settings,
}: {
  name: string;
  settings: ClubSettings;
}) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(initialName);
  const [duesAmount, setDuesAmount] = useState(String(settings.duesAmount));
  const [currency, setCurrency] = useState(settings.currency);
  const [currentPeriod, setCurrentPeriod] = useState(settings.currentPeriod);
  const [departments, setDepartments] = useState<string[]>(settings.departments);
  const [committees, setCommittees] = useState<string[]>(settings.committees);
  const [membershipOpen, setMembershipOpen] = useState(settings.membershipOpen);

  function submit() {
    startTransition(async () => {
      const result = await updateSettings(clubSlug, {
        name,
        duesAmount,
        currency,
        currentPeriod,
        departments,
        committees,
        membershipOpen,
      });
      if (result.ok) {
        toast.success("Settings saved.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Club name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currentPeriod">Current period</Label>
          <Input
            id="currentPeriod"
            value={currentPeriod}
            onChange={(e) => setCurrentPeriod(e.target.value)}
            placeholder="e.g. 2026/2027"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duesAmount">Dues amount</Label>
          <Input
            id="duesAmount"
            type="number"
            min="0"
            step="0.01"
            value={duesAmount}
            onChange={(e) => setDuesAmount(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="e.g. NGN"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Departments</Label>
        <ListEditor
          items={departments}
          onChange={setDepartments}
          placeholder="Add a department…"
        />
      </div>

      <div className="space-y-2">
        <Label>Committees</Label>
        <ListEditor
          items={committees}
          onChange={setCommittees}
          placeholder="Add a committee…"
        />
      </div>

      <div className="flex items-start justify-between gap-6 rounded-md border p-4">
        <div className="space-y-1">
          <Label htmlFor="membershipOpen">
            Accept new membership applications
          </Label>
          <p className="text-sm text-muted-foreground">
            When off, your club&apos;s registration link shows an
            &ldquo;applications are closed&rdquo; message instead of a form. You
            can still add members yourself.
          </p>
        </div>
        <Switch
          id="membershipOpen"
          checked={membershipOpen}
          onCheckedChange={setMembershipOpen}
          disabled={pending}
        />
      </div>

      <Button onClick={submit} disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </div>
  );
}
