"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
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
import { createElection, updateElection } from "./actions";

type ElectionValues = {
  id: string;
  title: string;
  description: string | null;
  positions: string[];
  applicationsStartLocal: string;
  applicationsEndLocal: string;
  votingStartLocal: string;
  votingEndLocal: string;
};

export function ElectionFormDialog({ election }: { election?: ElectionValues }) {
  const isEdit = !!election;
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(election?.title ?? "");
  const [description, setDescription] = useState(election?.description ?? "");
  const [positions, setPositions] = useState<string[]>(
    election?.positions ?? [""],
  );
  const [applicationsStart, setApplicationsStart] = useState(
    election?.applicationsStartLocal ?? "",
  );
  const [applicationsEnd, setApplicationsEnd] = useState(
    election?.applicationsEndLocal ?? "",
  );
  const [votingStart, setVotingStart] = useState(election?.votingStartLocal ?? "");
  const [votingEnd, setVotingEnd] = useState(election?.votingEndLocal ?? "");

  function setPosition(index: number, value: string) {
    setPositions((prev) => prev.map((p, i) => (i === index ? value : p)));
  }
  function addPosition() {
    setPositions((prev) => [...prev, ""]);
  }
  function removePosition(index: number) {
    setPositions((prev) => prev.filter((_, i) => i !== index));
  }

  function submit() {
    startTransition(async () => {
      const input = {
        title,
        description,
        positions: positions
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t) => ({ title: t })),
        applicationsStartAt: applicationsStart,
        applicationsEndAt: applicationsEnd,
        votingStartAt: votingStart,
        votingEndAt: votingEnd,
      };
      const result = isEdit
        ? await updateElection(clubSlug, election!.id, input)
        : await createElection(clubSlug, input);
      if (result.ok) {
        toast.success(isEdit ? "Election updated." : "Election created.");
        setOpen(false);
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
        {isEdit ? "Edit" : "Create election"}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit election" : "Create election"}</DialogTitle>
          <DialogDescription>
            Times are in West Africa Time (Africa/Lagos). Windows must run in order:
            applications, then voting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 2026/2027 Executive Elections"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Positions</Label>
            <div className="space-y-2">
              {positions.map((position, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={position}
                    onChange={(e) => setPosition(index, e.target.value)}
                    placeholder={`Position ${index + 1} (e.g. President)`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePosition(index)}
                    disabled={positions.length === 1}
                    aria-label="Remove position"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addPosition}>
              <Plus className="size-4" /> Add position
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="applicationsStart">Applications open</Label>
              <Input
                id="applicationsStart"
                type="datetime-local"
                value={applicationsStart}
                onChange={(e) => setApplicationsStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="applicationsEnd">Applications close</Label>
              <Input
                id="applicationsEnd"
                type="datetime-local"
                value={applicationsEnd}
                onChange={(e) => setApplicationsEnd(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="votingStart">Voting opens</Label>
              <Input
                id="votingStart"
                type="datetime-local"
                value={votingStart}
                onChange={(e) => setVotingStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="votingEnd">Voting closes</Label>
              <Input
                id="votingEnd"
                type="datetime-local"
                value={votingEnd}
                onChange={(e) => setVotingEnd(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create election"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
