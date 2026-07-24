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
  grantPlatformAdmin,
  revokePlatformAdmin,
  type ActionResult,
} from "./user-actions";

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

/**
 * Per-row platform-admin toggle. `disabledReason` mirrors the exact cases the
 * server action would refuse (self, member-can't-grant, last admin) so the
 * control matches server truth — but it is a courtesy: the action re-derives
 * every one of them.
 */
export function AdminToggle({
  userId,
  name,
  isAdmin,
  disabledReason,
}: {
  userId: string;
  name: string;
  isAdmin: boolean;
  disabledReason: string | null;
}) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const disabled = pending || disabledReason !== null;

  if (isAdmin) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        title={disabledReason ?? undefined}
        onClick={() =>
          run(() => revokePlatformAdmin(userId), `${name} is no longer an admin.`)
        }
      >
        Revoke admin
      </Button>
    );
  }

  // Promotion is consequential, so it goes through a confirm dialog.
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            disabled={disabled}
            title={disabledReason ?? undefined}
          />
        }
      >
        Make admin
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make {name} a platform admin?</DialogTitle>
          <DialogDescription>
            They&apos;ll be able to approve, reject, and suspend clubs across the
            platform, and manage who else is an admin. They will not gain access
            to any club&apos;s members, dues, events, or settings.
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
            disabled={pending}
            onClick={() => {
              run(() => grantPlatformAdmin(userId), `${name} is now an admin.`);
              setOpen(false);
            }}
          >
            {pending ? "Granting…" : "Grant admin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
