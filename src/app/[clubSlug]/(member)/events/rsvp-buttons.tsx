"use client";

import { useParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { rsvp } from "./actions";

const OPTIONS: { value: "GOING" | "MAYBE" | "NOT_GOING"; label: string }[] = [
  { value: "GOING", label: "Going" },
  { value: "MAYBE", label: "Maybe" },
  { value: "NOT_GOING", label: "Not going" },
];

export function RsvpButtons({
  eventId,
  current,
}: {
  eventId: string;
  current: "GOING" | "MAYBE" | "NOT_GOING" | null;
}) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const [selected, setSelected] = useState(current);
  const [pending, startTransition] = useTransition();

  function choose(value: "GOING" | "MAYBE" | "NOT_GOING") {
    const prev = selected;
    setSelected(value);
    startTransition(async () => {
      const result = await rsvp(clubSlug, eventId, value);
      if (result.ok) toast.success("RSVP saved.");
      else {
        setSelected(prev);
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  // A segmented control, not three buttons: RSVP is one choice among three, and
  // the control should say so (§C2).
  return (
    <div
      role="radiogroup"
      aria-label="Your RSVP"
      className="inline-flex rounded-lg border border-border bg-background p-0.5"
    >
      {OPTIONS.map((o) => {
        const active = selected === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={pending}
            onClick={() => choose(o.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
              active
                ? "bg-primary text-primary-fg"
                : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
