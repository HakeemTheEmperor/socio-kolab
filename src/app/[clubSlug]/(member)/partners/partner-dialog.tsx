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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPartner, updatePartner } from "./actions";

export type LiaisonOption = { id: string; name: string; role: string };

/** Select needs a non-empty value; this stands in for "no liaison". */
const NONE = "__none";

export function PartnerDialog({
  members,
  partner,
}: {
  /** ACTIVE memberships of this club, for the liaison picker. */
  members: LiaisonOption[];
  /** When set, the dialog edits this partner instead of creating one. */
  partner?: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    contactPerson: string | null;
    liaisonId: string | null;
  };
}) {
  const isEdit = !!partner;
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(partner?.name ?? "");
  const [email, setEmail] = useState(partner?.email ?? "");
  const [phone, setPhone] = useState(partner?.phone ?? "");
  const [contactPerson, setContactPerson] = useState(partner?.contactPerson ?? "");
  const [liaisonId, setLiaisonId] = useState(partner?.liaisonId ?? NONE);

  function submit() {
    startTransition(async () => {
      const input = {
        name,
        email,
        phone,
        contactPerson,
        liaisonId: liaisonId === NONE ? "" : liaisonId,
      };
      const result = isEdit
        ? await updatePartner(clubSlug, partner.id, input)
        : await createPartner(clubSlug, input);
      if (result.ok) {
        toast.success(isEdit ? "Partner updated." : "Partner added.");
        setOpen(false);
        if (!isEdit) {
          setName("");
          setEmail("");
          setPhone("");
          setContactPerson("");
          setLiaisonId(NONE);
        }
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="sm" variant={isEdit ? "outline" : "default"} />}
      >
        {isEdit ? "Edit" : "Add partner"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit partner" : "Add partner"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Keep the contact details and liaison up to date."
              : "An organization or person the club works with."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="partner-name">Name</Label>
            <Input
              id="partner-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tech Hub Lagos"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="partner-email">Email</Label>
            <Input
              id="partner-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="partner-phone">Phone (optional)</Label>
            <Input
              id="partner-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="partner-contact">Contact person (optional)</Label>
            <Input
              id="partner-contact"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="Who the club talks to at the partner"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="partner-liaison">Liaison officer</Label>
            <Select
              value={liaisonId}
              onValueChange={(v) => v && setLiaisonId(v)}
            >
              <SelectTrigger id="partner-liaison">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No liaison yet</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[13px] text-muted-foreground">
              The club member responsible for this relationship.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Add partner"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
