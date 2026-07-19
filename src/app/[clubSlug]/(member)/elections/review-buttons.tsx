"use client";

import { useParams, useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { reviewApplication } from "./actions";

/** Approve / reject controls for one pending application (president only). */
export function ReviewButtons({
  electionId,
  candidacyId,
}: {
  electionId: string;
  candidacyId: string;
}) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function decide(decision: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      const result = await reviewApplication(clubSlug, electionId, candidacyId, decision);
      if (result.ok) {
        toast.success(decision === "APPROVED" ? "Approved." : "Rejected.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={() => decide("APPROVED")} disabled={pending}>
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => decide("REJECTED")}
        disabled={pending}
      >
        Reject
      </Button>
    </div>
  );
}
