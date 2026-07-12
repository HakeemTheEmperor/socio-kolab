"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  const [selected, setSelected] = useState(current);
  const [pending, startTransition] = useTransition();

  function choose(value: "GOING" | "MAYBE" | "NOT_GOING") {
    const prev = selected;
    setSelected(value);
    startTransition(async () => {
      const result = await rsvp(eventId, value);
      if (result.ok) toast.success("RSVP saved.");
      else {
        setSelected(prev);
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((o) => (
        <Button
          key={o.value}
          size="sm"
          variant={selected === o.value ? "default" : "outline"}
          disabled={pending}
          onClick={() => choose(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
