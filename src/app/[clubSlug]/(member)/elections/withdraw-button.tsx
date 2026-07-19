"use client";

import { useParams, useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { withdrawApplication } from "./actions";

export function WithdrawButton({
  electionId,
  candidacyId,
}: {
  electionId: string;
  candidacyId: string;
}) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function withdraw() {
    startTransition(async () => {
      const result = await withdrawApplication(clubSlug, electionId, candidacyId);
      if (result.ok) {
        toast.success("Application withdrawn.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={withdraw} disabled={pending}>
      {pending ? "Withdrawing…" : "Withdraw"}
    </Button>
  );
}
