"use client";

import { useParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/date-block";
import { toggleCheckIn, toggleGuestCheckIn } from "../actions";

export type CheckInEntry = {
  kind: "member" | "guest";
  /** membershipId for a member, Attendance id for a guest. */
  targetId: string;
  name: string;
  department: string | null;
  rsvp: "GOING" | "MAYBE" | "NOT_GOING" | null;
  checkedIn: boolean;
};

const keyOf = (e: CheckInEntry) => `${e.kind}:${e.targetId}`;

export function CheckInList({
  eventId,
  entries,
}: {
  eventId: string;
  entries: CheckInEntry[];
}) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(entries.map((e) => [keyOf(e), e.checkedIn])),
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [query, entries]);

  function toggle(entry: CheckInEntry) {
    const key = keyOf(entry);
    const next = !checked[key];
    setChecked((c) => ({ ...c, [key]: next }));
    setPendingKey(key);
    startTransition(async () => {
      const result =
        entry.kind === "member"
          ? await toggleCheckIn(clubSlug, eventId, entry.targetId, next)
          : await toggleGuestCheckIn(clubSlug, eventId, entry.targetId, next);
      if (result.ok) {
        toast.success(next ? "Checked in." : "Check-in removed.");
      } else {
        setChecked((c) => ({ ...c, [key]: !next }));
        toast.error(result.error ?? "Something went wrong.");
      }
      setPendingKey(null);
    });
  }

  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          placeholder="Search attendees…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <p className="text-sm text-muted-foreground">{checkedCount} checked in</p>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one matches.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {filtered.map((entry) => {
            const key = keyOf(entry);
            return (
              <li key={key} className="flex items-center gap-3 p-4">
                <Avatar name={entry.name} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    {entry.name}
                    {entry.kind === "guest" ? (
                      <Badge variant="neutral">Guest</Badge>
                    ) : null}
                  </p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {entry.department ?? "—"}
                    {entry.rsvp
                      ? ` · RSVP: ${entry.rsvp.replace("_", " ").toLowerCase()}`
                      : ""}
                  </p>
                </div>
                {checked[key] ? (
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
                  variant={checked[key] ? "outline" : "default"}
                  disabled={pendingKey === key}
                  onClick={() => toggle(entry)}
                >
                  {checked[key] ? "Undo" : "Check in"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
