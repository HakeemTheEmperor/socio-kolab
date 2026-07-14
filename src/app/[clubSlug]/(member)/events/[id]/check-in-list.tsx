"use client";

import { useParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/date-block";
import { toggleCheckIn } from "../actions";

export type CheckInMember = {
  membershipId: string;
  name: string;
  department: string | null;
  rsvp: "GOING" | "MAYBE" | "NOT_GOING" | null;
  checkedIn: boolean;
};

export function CheckInList({
  eventId,
  members,
}: {
  eventId: string;
  members: CheckInMember[];
}) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(members.map((m) => [m.membershipId, m.checkedIn])),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name.toLowerCase().includes(q));
  }, [query, members]);

  function toggle(membershipId: string) {
    const next = !checked[membershipId];
    setChecked((c) => ({ ...c, [membershipId]: next }));
    setPendingId(membershipId);
    startTransition(async () => {
      const result = await toggleCheckIn(clubSlug, eventId, membershipId, next);
      if (result.ok) {
        toast.success(next ? "Checked in." : "Check-in removed.");
      } else {
        setChecked((c) => ({ ...c, [membershipId]: !next }));
        toast.error(result.error ?? "Something went wrong.");
      }
      setPendingId(null);
    });
  }

  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          placeholder="Search members…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <p className="text-sm text-muted-foreground">
          {checkedCount} checked in
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No members match.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {filtered.map((m) => (
            <li
              key={m.membershipId}
              className="flex items-center gap-3 p-4"
            >
              <Avatar name={m.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="truncate text-[13px] text-muted-foreground">
                  {m.department ?? "—"}
                  {m.rsvp
                    ? ` · RSVP: ${m.rsvp.replace("_", " ").toLowerCase()}`
                    : ""}
                </p>
              </div>
              {checked[m.membershipId] ? (
                <span className="inline-flex items-center gap-1.5 text-[13px] text-success-tint-fg">
                  <CheckCircle2
                    aria-hidden
                    strokeWidth={1.75}
                    className="size-4 shrink-0"
                  />
                  Checked in
                </span>
              ) : null}
              <Button
                size="sm"
                variant={checked[m.membershipId] ? "outline" : "default"}
                disabled={pendingId === m.membershipId}
                onClick={() => toggle(m.membershipId)}
              >
                {checked[m.membershipId] ? "Undo" : "Check in"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
