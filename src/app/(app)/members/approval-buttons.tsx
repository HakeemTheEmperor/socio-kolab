"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { approveMember, rejectMember } from "./actions";

export function ApprovalButtons({ membershipId }: { membershipId: string }) {
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(ok);
      else toast.error(result.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => run(() => approveMember(membershipId), "Member approved.")}
      >
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => rejectMember(membershipId), "Member rejected.")}
      >
        Reject
      </Button>
    </div>
  );
}
