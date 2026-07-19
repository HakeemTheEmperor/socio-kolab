import type { PositionTally, ResultsTurnout } from "@/lib/elections";

/**
 * Presentational tally view — a plain component (no hooks) so it renders both in
 * the closed-results server page and inside the live-results client poller.
 */
export function ResultsView({
  tallies,
  turnout,
  live,
}: {
  tallies: PositionTally[];
  turnout: ResultsTurnout;
  /** When true, label counts as provisional (voting still open). */
  live?: boolean;
}) {
  const turnoutPct =
    turnout.eligibleVoters === 0
      ? 0
      : Math.round((turnout.ballotsCast / turnout.eligibleVoters) * 1000) / 10;

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">
        {live ? "Provisional — " : ""}
        {turnout.ballotsCast} of {turnout.eligibleVoters} members voted ({turnoutPct}%
        turnout).
      </p>

      {tallies.map((position) => (
        <div
          key={position.positionId}
          className="rounded-xl border border-border bg-surface p-6"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[15px] font-medium">{position.title}</h3>
            <span className="text-[13px] text-muted-foreground">
              {position.totalVotes} vote{position.totalVotes === 1 ? "" : "s"}
            </span>
          </div>

          {position.candidates.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted-foreground">No candidates.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {position.candidates.map((candidate) => (
                <li key={candidate.candidacyId}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">
                      {candidate.name}
                      {candidate.leading ? (
                        <span className="ml-2 text-[12px] font-normal text-success-tint-fg">
                          {live ? "Leading" : "Winner"}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {candidate.votes} · {candidate.share}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${candidate.share}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
