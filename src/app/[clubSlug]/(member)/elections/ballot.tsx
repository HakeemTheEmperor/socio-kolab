"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { castVote } from "./actions";

export type BallotCandidate = { candidacyId: string; name: string; statement: string };
export type BallotPosition = {
  positionId: string;
  title: string;
  candidates: BallotCandidate[];
  voted: boolean;
};

function PositionBallot({
  electionId,
  position,
}: {
  electionId: string;
  position: BallotPosition;
}) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!selected) return;
    startTransition(async () => {
      const result = await castVote(clubSlug, electionId, position.positionId, selected);
      if (result.ok) {
        toast.success(`Vote recorded for ${position.title}.`);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  if (position.voted) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-medium">{position.title}</h3>
          <span className="inline-flex items-center gap-1.5 text-[13px] text-success-tint-fg">
            <Check aria-hidden className="size-4" /> Ballot cast
          </span>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Your vote is anonymous and can&apos;t be changed.
        </p>
      </div>
    );
  }

  if (position.candidates.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6">
        <h3 className="text-[15px] font-medium">{position.title}</h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          No approved candidates for this position.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h3 className="text-[15px] font-medium">{position.title}</h3>
      <fieldset className="mt-4 space-y-2">
        <legend className="sr-only">Candidates for {position.title}</legend>
        {position.candidates.map((candidate) => (
          <label
            key={candidate.candidacyId}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:border-ring has-checked:border-ring has-checked:bg-muted/50"
          >
            <input
              type="radio"
              name={`ballot-${position.positionId}`}
              value={candidate.candidacyId}
              checked={selected === candidate.candidacyId}
              onChange={() => setSelected(candidate.candidacyId)}
              disabled={pending}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{candidate.name}</span>
              <span className="mt-0.5 block text-[13px] whitespace-pre-line text-muted-foreground">
                {candidate.statement}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="mt-4">
        <Button size="sm" onClick={submit} disabled={pending || !selected}>
          {pending ? "Recording…" : "Cast vote"}
        </Button>
      </div>
    </div>
  );
}

export function Ballot({
  electionId,
  positions,
}: {
  electionId: string;
  positions: BallotPosition[];
}) {
  return (
    <div className="space-y-3">
      {positions.map((position) => (
        <PositionBallot
          key={position.positionId}
          electionId={electionId}
          position={position}
        />
      ))}
    </div>
  );
}
