"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { setEventFormStatusAction } from "./actions";

/**
 * Open/close a registration form's intake (EVENT-FORMS.md §2.3). Applies
 * instantly through its own action — independent of saving the event or its
 * form. Optimistic, reverting on failure.
 */
export function IntakeToggle({
  eventId,
  accepting,
}: {
  eventId: string;
  accepting: boolean;
}) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const router = useRouter();
  const [on, setOn] = useState(accepting);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    setOn(next); // optimistic
    startTransition(async () => {
      const result = await setEventFormStatusAction(clubSlug, eventId, next);
      if (result.ok) {
        toast.success(next ? "Now accepting responses." : "Responses closed.");
        router.refresh();
      } else {
        setOn(!next); // revert
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch checked={on} onCheckedChange={change} disabled={pending} />
      <span className="text-muted-foreground">Accepting responses</span>
    </label>
  );
}
