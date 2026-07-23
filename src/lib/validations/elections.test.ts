import { describe, expect, it } from "vitest";

import { applicationSchema, electionSchema } from "./elections";

const base = {
  title: "Exec Elections 2026",
  description: "",
  positions: [{ title: "President" }, { title: "Secretary" }],
  applicationsStartAt: "2026-08-01T09:00",
  applicationsEndAt: "2026-08-08T17:00",
  votingStartAt: "2026-08-10T09:00",
  votingEndAt: "2026-08-12T17:00",
};

describe("electionSchema", () => {
  it("accepts a well-formed election and parses datetime-local as Lagos time", () => {
    const parsed = electionSchema.parse(base);
    // 09:00 Lagos (UTC+1) is 08:00 UTC.
    expect(parsed.applicationsStartAt.toISOString()).toBe("2026-08-01T08:00:00.000Z");
    expect(parsed.positions).toHaveLength(2);
    expect(parsed.description).toBeNull();
  });

  it("requires at least one position", () => {
    const r = electionSchema.safeParse({ ...base, positions: [] });
    expect(r.success).toBe(false);
  });

  it("rejects duplicate position titles case-insensitively", () => {
    const r = electionSchema.safeParse({
      ...base,
      positions: [{ title: "President" }, { title: "president" }],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toContain("positions");
  });

  it("rejects applications ending before they start", () => {
    const r = electionSchema.safeParse({
      ...base,
      applicationsEndAt: "2026-07-30T17:00",
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toContain("applicationsEndAt");
  });

  it("rejects voting starting before applications close", () => {
    const r = electionSchema.safeParse({
      ...base,
      votingStartAt: "2026-08-07T09:00",
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toContain("votingStartAt");
  });

  it("rejects voting ending before it starts", () => {
    const r = electionSchema.safeParse({ ...base, votingEndAt: "2026-08-09T09:00" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toContain("votingEndAt");
  });
});

describe("applicationSchema", () => {
  it("requires a statement of at least 20 characters", () => {
    expect(applicationSchema.safeParse({ statement: "too short" }).success).toBe(false);
    expect(
      applicationSchema.safeParse({ statement: "I would be a great president." }).success,
    ).toBe(true);
  });
});
