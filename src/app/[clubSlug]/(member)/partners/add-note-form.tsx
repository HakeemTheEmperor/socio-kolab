"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addPartnerNote } from "./actions";

export function AddNoteForm({ partnerId }: { partnerId: string }) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await addPartnerNote(clubSlug, partnerId, body);
      if (result.ok) {
        toast.success("Log entry added.");
        setBody("");
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="note-body">Add a log entry</Label>
      <Textarea
        id="note-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="e.g. Called about sponsoring the tech fair — they'll confirm by Friday."
        rows={3}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={pending || body.trim().length === 0}>
          {pending ? "Adding…" : "Add entry"}
        </Button>
      </div>
    </div>
  );
}
