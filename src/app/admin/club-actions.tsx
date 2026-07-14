"use client";

import { useRouter } from "next/navigation";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  approveClub,
  rejectClub,
  suspendClub,
  reactivateClub,
  type ActionResult,
} from "./actions";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return { pending, run };
}

/** Approve / reject a club request. */
export function RequestDecision({
  clubId,
  name,
}: {
  clubId: string;
  name: string;
}) {
  const { pending, run } = useRun();

  return (
    <div className="flex justify-end gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => run(() => approveClub(clubId), `${name} approved.`)}
      >
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => rejectClub(clubId), `${name} rejected.`)}
      >
        Reject
      </Button>
    </div>
  );
}

/**
 * Suspend an ACTIVE club or reactivate a SUSPENDED one. Suspension takes a live
 * club offline for all its members at once, so it goes through a confirm dialog;
 * reactivating is harmless and doesn't.
 */
export function SuspensionToggle({
  clubId,
  name,
  status,
}: {
  clubId: string;
  name: string;
  status: string;
}) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);

  if (status === "SUSPENDED") {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => reactivateClub(clubId), `${name} reactivated.`)}
      >
        Reactivate
      </Button>
    );
  }

  if (status !== "ACTIVE") {
    // PENDING clubs are decided above; REJECTED clubs are done with.
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        Suspend
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend {name}?</DialogTitle>
          <DialogDescription>
            Its pages stop resolving for every member — the club&apos;s URL will
            return “not found” until you reactivate it. Nothing is deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              run(() => suspendClub(clubId), `${name} suspended.`);
              setOpen(false);
            }}
          >
            {pending ? "Suspending…" : "Suspend club"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
