"use client";

import { useParams } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { approveMember, rejectMember } from "./actions";

export function ApprovalButtons({ membershipId }: { membershipId: string }) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
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
        onClick={() =>
          run(() => approveMember(clubSlug, membershipId), "Member approved.")
        }
      >
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          run(() => rejectMember(clubSlug, membershipId), "Member rejected.")
        }
      >
        Reject
      </Button>
    </div>
  );
}
