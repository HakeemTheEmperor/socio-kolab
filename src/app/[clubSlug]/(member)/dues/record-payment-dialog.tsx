"use client";

import { useParams } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { recordPayment } from "./actions";

const METHODS = ["cash", "transfer", "other"];

export function RecordPaymentDialog({
  membershipId,
  memberName,
  period,
  defaultAmount,
  existing,
}: {
  membershipId: string;
  memberName: string;
  period: string;
  defaultAmount: number;
  existing?: { amount: number; method: string | null; note: string | null } | null;
}) {
  const isEdit = !!existing;
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [amount, setAmount] = useState(String(existing?.amount ?? defaultAmount));
  const [method, setMethod] = useState(existing?.method ?? "cash");
  const [note, setNote] = useState(existing?.note ?? "");

  function submit() {
    startTransition(async () => {
      const result = await recordPayment(clubSlug, {
        membershipId,
        period,
        amount,
        method: method as "cash" | "transfer" | "other",
        note,
      });
      if (result.ok) {
        toast.success(isEdit ? "Payment updated." : "Payment recorded.");
        setOpen(false);
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="sm" variant={isEdit ? "ghost" : "default"} />}
      >
        {isEdit ? "Edit" : "Record payment"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit payment" : "Record payment"}
          </DialogTitle>
          <DialogDescription>
            {memberName} · {period}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="method">Method</Label>
            <Select value={method} onValueChange={(v) => v && setMethod(v)}>
              <SelectTrigger id="method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. paid at general meeting"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
