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
import { archivePartner, restorePartner } from "./actions";

export function ArchivePartnerButton({
  partnerId,
  name,
  archived,
}: {
  partnerId: string;
  name: string;
  archived: boolean;
}) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function restore() {
    startTransition(async () => {
      const result = await restorePartner(clubSlug, partnerId);
      if (result.ok) {
        toast.success("Partner restored.");
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  function confirmArchive() {
    startTransition(async () => {
      const result = await archivePartner(clubSlug, partnerId);
      if (result.ok) {
        toast.success("Partner archived.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  // Restoring is harmless (it only re-opens the record), so no confirm step.
  if (archived) {
    return (
      <Button size="sm" variant="outline" onClick={restore} disabled={pending}>
        {pending ? "Restoring…" : "Restore"}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        Archive
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive partner?</DialogTitle>
          <DialogDescription>
            “{name}” will be hidden from the partners list and its log closed to
            new entries. Nothing is deleted — you can restore it any time.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={confirmArchive} disabled={pending}>
            {pending ? "Archiving…" : "Archive partner"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
