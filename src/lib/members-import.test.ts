import { describe, expect, it } from "vitest";

import {
  dedupeByEmail,
  parseCsv,
  parseDelimited,
  parseMemberRows,
  type ParsedMemberRow,
} from "./members-import";

describe("parseDelimited", () => {
  it("splits simple comma rows", () => {
    expect(parseDelimited("a,b,c\nd,e,f", ",")).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    expect(parseDelimited('"Doe, Jane","she said ""hi"""', ",")).toEqual([
      ["Doe, Jane", 'she said "hi"'],
    ]);
  });

  it("treats CRLF and LF alike and drops blank rows", () => {
    expect(parseDelimited("a,b\r\n\r\nc,d\n", ",")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("splits on tab when asked", () => {
    expect(parseDelimited("a\tb\tc", "\t")).toEqual([["a", "b", "c"]]);
  });
});

describe("parseMemberRows", () => {
  it("skips a header row and maps columns positionally", () => {
    const rows = parseMemberRows(
      "name,email,phone,department,level\nAda,ada@x.io,0801,CS,300",
    );
    expect(rows).toEqual([
      {
        line: 2,
        name: "Ada",
        email: "ada@x.io",
        phone: "0801",
        department: "CS",
        level: "300",
      },
    ]);
  });

  it("does not skip a first row that is real data (no header)", () => {
    const rows = parseMemberRows("Ada,ada@x.io");
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Ada");
    expect(rows[0].line).toBe(1);
  });

  it("auto-detects tab-separated paste and trims cells", () => {
    const rows = parseMemberRows("Ada\t ada@x.io \tCS");
    expect(rows[0].name).toBe("Ada");
    expect(rows[0].email).toBe("ada@x.io");
    expect(rows[0].phone).toBe("CS");
  });

  it("fills missing trailing columns with empty strings", () => {
    const [row] = parseMemberRows("Ada,ada@x.io");
    expect(row.phone).toBe("");
    expect(row.department).toBe("");
    expect(row.level).toBe("");
  });

  it("returns nothing for blank input", () => {
    expect(parseMemberRows("\n  \n")).toEqual([]);
  });

  it("keeps line numbers anchored to the file including the header", () => {
    const rows = parseMemberRows("name,email\nA,a@x.io\nB,b@x.io");
    expect(rows.map((r) => r.line)).toEqual([2, 3]);
  });
});

describe("parseCsv", () => {
  it("is the comma-delimited wrapper", () => {
    expect(parseCsv("a,b")).toEqual([["a", "b"]]);
  });
});

describe("dedupeByEmail", () => {
  const row = (email: string, line = 1): ParsedMemberRow => ({
    line,
    name: "X",
    email,
    phone: "",
    department: "",
    level: "",
  });

  it("keeps the first occurrence and flags later duplicates (case-insensitive)", () => {
    const { unique, duplicates } = dedupeByEmail([
      row("a@x.io", 1),
      row("A@X.io", 2),
      row("b@x.io", 3),
    ]);
    expect(unique.map((r) => r.line)).toEqual([1, 3]);
    expect(duplicates.map((r) => r.line)).toEqual([2]);
  });

  it("never treats blank emails as duplicates of each other", () => {
    const { unique, duplicates } = dedupeByEmail([row("", 1), row("", 2)]);
    expect(unique).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });
});
