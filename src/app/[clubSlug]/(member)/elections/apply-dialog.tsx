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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { applyForPosition } from "./actions";

export function ApplyDialog({
  electionId,
  positionId,
  positionTitle,
  existingStatement,
  reapply,
}: {
  electionId: string;
  positionId: string;
  positionTitle: string;
  existingStatement?: string;
  /** True when re-opening a withdrawn application. */
  reapply?: boolean;
}) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [statement, setStatement] = useState(existingStatement ?? "");

  function submit() {
    startTransition(async () => {
      const result = await applyForPosition(clubSlug, electionId, positionId, {
        statement,
      });
      if (result.ok) {
        toast.success("Application submitted.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        {reapply ? "Re-apply" : "Apply"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply for {positionTitle}</DialogTitle>
          <DialogDescription>
            Write a short manifesto. Members will read it on the ballot.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="statement">Your statement</Label>
          <Textarea
            id="statement"
            rows={6}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="Why members should vote for you…"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Submitting…" : "Submit application"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
