import { describe, expect, it } from "vitest";

import {
  buildResultsCsvRows,
  buildTallies,
  getElectionPhase,
  resultsCsv,
  type ElectionWindows,
  type TallyCandidate,
  type TallyPosition,
  type VoteGroupRow,
} from "./elections";

// A published election with a clean applications→review→voting timeline.
const windows = (overrides: Partial<ElectionWindows> = {}): ElectionWindows => ({
  status: "PUBLISHED",
  applicationsStartAt: new Date("2026-08-01T00:00:00+01:00"),
  applicationsEndAt: new Date("2026-08-08T00:00:00+01:00"),
  votingStartAt: new Date("2026-08-10T00:00:00+01:00"),
  votingEndAt: new Date("2026-08-12T00:00:00+01:00"),
  ...overrides,
});

describe("getElectionPhase", () => {
  it("lets status override the clock", () => {
    const mid = new Date("2026-08-11T00:00:00+01:00"); // inside voting window
    expect(getElectionPhase(windows({ status: "DRAFT" }), mid)).toBe("draft");
    expect(getElectionPhase(windows({ status: "CLOSED" }), mid)).toBe("closed");
    expect(getElectionPhase(windows({ status: "CANCELLED" }), mid)).toBe("cancelled");
  });

  it("derives phases across the timeline for a published election", () => {
    expect(getElectionPhase(windows(), new Date("2026-07-30T00:00:00+01:00"))).toBe(
      "scheduled",
    );
    expect(getElectionPhase(windows(), new Date("2026-08-05T00:00:00+01:00"))).toBe(
      "applications",
    );
    expect(getElectionPhase(windows(), new Date("2026-08-09T00:00:00+01:00"))).toBe(
      "review",
    );
    expect(getElectionPhase(windows(), new Date("2026-08-11T00:00:00+01:00"))).toBe(
      "voting",
    );
    expect(getElectionPhase(windows(), new Date("2026-08-20T00:00:00+01:00"))).toBe(
      "closed",
    );
  });

  it("treats window starts as inclusive and ends as exclusive", () => {
    const e = windows();
    // exactly applicationsStartAt → applications
    expect(getElectionPhase(e, e.applicationsStartAt)).toBe("applications");
    // exactly applicationsEndAt → review (end is exclusive)
    expect(getElectionPhase(e, e.applicationsEndAt)).toBe("review");
    // exactly votingStartAt → voting
    expect(getElectionPhase(e, e.votingStartAt)).toBe("voting");
    // exactly votingEndAt → closed (end is exclusive)
    expect(getElectionPhase(e, e.votingEndAt)).toBe("closed");
  });
});

const positions: TallyPosition[] = [
  { id: "p1", title: "President" },
  { id: "p2", title: "Secretary" },
];
const candidates: TallyCandidate[] = [
  { id: "c1", positionId: "p1", name: "Ada" },
  { id: "c2", positionId: "p1", name: "Bode" },
  { id: "c3", positionId: "p2", name: "Chidi" },
];

describe("buildTallies", () => {
  it("zero-fills candidates and positions with no votes", () => {
    const tallies = buildTallies(positions, candidates, []);
    const president = tallies.find((t) => t.positionId === "p1")!;
    expect(president.totalVotes).toBe(0);
    expect(president.candidates).toHaveLength(2);
    expect(president.candidates.every((c) => c.votes === 0 && c.share === 0)).toBe(true);
    // No leader when nobody has voted.
    expect(president.candidates.every((c) => !c.leading)).toBe(true);
  });

  it("computes votes, shares, and orders by votes descending", () => {
    const rows: VoteGroupRow[] = [
      { positionId: "p1", candidacyId: "c1", _count: { _all: 3 } },
      { positionId: "p1", candidacyId: "c2", _count: { _all: 1 } },
    ];
    const president = buildTallies(positions, candidates, rows).find(
      (t) => t.positionId === "p1",
    )!;
    expect(president.totalVotes).toBe(4);
    expect(president.candidates[0]).toMatchObject({ name: "Ada", votes: 3, leading: true });
    expect(president.candidates[0].share).toBe(75);
    expect(president.candidates[1]).toMatchObject({ name: "Bode", votes: 1, leading: false });
    expect(president.candidates[1].share).toBe(25);
  });

  it("marks all tied leaders", () => {
    const rows: VoteGroupRow[] = [
      { positionId: "p1", candidacyId: "c1", _count: { _all: 2 } },
      { positionId: "p1", candidacyId: "c2", _count: { _all: 2 } },
    ];
    const president = buildTallies(positions, candidates, rows).find(
      (t) => t.positionId === "p1",
    )!;
    expect(president.candidates.every((c) => c.leading)).toBe(true);
  });
});

describe("buildResultsCsvRows", () => {
  it("emits a turnout block and one row per candidate", () => {
    const rows: VoteGroupRow[] = [
      { positionId: "p1", candidacyId: "c1", _count: { _all: 3 } },
      { positionId: "p1", candidacyId: "c2", _count: { _all: 1 } },
    ];
    const tallies = buildTallies(positions, candidates, rows);
    const csvRows = buildResultsCsvRows(tallies, { eligibleVoters: 10, ballotsCast: 4 });

    expect(csvRows[0]).toEqual(["Eligible voters", "10"]);
    expect(csvRows[1]).toEqual(["Members who voted", "4"]);
    expect(csvRows[2]).toEqual(["Turnout", "40%"]);
    expect(csvRows[4]).toEqual(["Position", "Candidate", "Votes", "Share", "Outcome"]);
    expect(csvRows).toContainEqual(["President", "Ada", "3", "75%", "Leading"]);
    expect(csvRows).toContainEqual(["Secretary", "Chidi", "0", "0%", ""]);
  });

  it("neutralises a formula-injection candidate name through toCsv", () => {
    const evil: TallyCandidate[] = [{ id: "c1", positionId: "p1", name: "=cmd()" }];
    const tallies = buildTallies([{ id: "p1", title: "President" }], evil, []);
    const csv = resultsCsv(tallies, { eligibleVoters: 1, ballotsCast: 0 });
    // csvCell prefixes a leading = with an apostrophe.
    expect(csv).toContain("'=cmd()");
  });
});
