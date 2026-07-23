"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cancelElection,
  closeElection,
  deleteElection,
  publishElection,
} from "./actions";

type Action = "publish" | "close" | "cancel" | "delete";

const COPY: Record<
  Action,
  { button: string; variant: "default" | "outline" | "destructive"; title: string; body: string; confirm: string; pending: string; success: string; navigateAway?: boolean }
> = {
  publish: {
    button: "Publish",
    variant: "default",
    title: "Publish this election?",
    body: "Members will see it and the schedule takes effect. The dates and positions lock once published.",
    confirm: "Publish",
    pending: "Publishing…",
    success: "Election published.",
  },
  close: {
    button: "Close now",
    variant: "outline",
    title: "Close voting now?",
    body: "This ends voting immediately (even if the scheduled end hasn't passed) and finalizes the results. This can't be undone.",
    confirm: "Close election",
    pending: "Closing…",
    success: "Election closed.",
  },
  cancel: {
    button: "Cancel election",
    variant: "outline",
    title: "Cancel this election?",
    body: "The election is aborted and no results are published. This can't be undone.",
    confirm: "Cancel election",
    pending: "Cancelling…",
    success: "Election cancelled.",
  },
  delete: {
    button: "Delete",
    variant: "destructive",
    title: "Delete this draft?",
    body: "The draft election and its positions are permanently removed. This can't be undone.",
    confirm: "Delete",
    pending: "Deleting…",
    success: "Election deleted.",
    navigateAway: true,
  },
};

function LifecycleButton({ electionId, action }: { electionId: string; action: Action }) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const copy = COPY[action];

  function run() {
    startTransition(async () => {
      const result =
        action === "publish"
          ? await publishElection(clubSlug, electionId)
          : action === "close"
            ? await closeElection(clubSlug, electionId)
            : action === "cancel"
              ? await cancelElection(clubSlug, electionId)
              : await deleteElection(clubSlug, electionId);
      if (result.ok) {
        toast.success(copy.success);
        setOpen(false);
        if (copy.navigateAway) router.push(`/${clubSlug}/elections`);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant={copy.variant} onClick={() => setOpen(true)}>
        {copy.button}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Back
          </Button>
          <Button variant={copy.variant} onClick={run} disabled={pending}>
            {pending ? copy.pending : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** President controls, shown per lifecycle phase. */
export function LifecycleControls({
  electionId,
  actions,
}: {
  electionId: string;
  actions: Action[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action) => (
        <LifecycleButton key={action} electionId={electionId} action={action} />
      ))}
    </div>
  );
}
