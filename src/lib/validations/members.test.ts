import { describe, expect, it } from "vitest";

import {
  MAX_IMPORT_ROWS,
  bulkImportSchema,
  importRowSchema,
} from "./members";

describe("importRowSchema", () => {
  it("accepts a full valid row and lowercases the email", () => {
    const parsed = importRowSchema.parse({
      name: "Ada Lovelace",
      email: "Ada@Example.IO",
      phone: "0801",
      department: "CS",
      level: "300",
    });
    expect(parsed.email).toBe("ada@example.io");
    expect(parsed.department).toBe("CS");
  });

  it("collapses blank optional fields to null", () => {
    const parsed = importRowSchema.parse({
      name: "Ada",
      email: "ada@x.io",
      phone: "",
      department: "  ",
      level: "",
    });
    expect(parsed.phone).toBeNull();
    expect(parsed.department).toBeNull();
    expect(parsed.level).toBeNull();
  });

  it("rejects a bad email", () => {
    expect(importRowSchema.safeParse({ name: "Ada", email: "nope" }).success).toBe(
      false,
    );
  });

  it("rejects a too-short name", () => {
    const r = importRowSchema.safeParse({ name: "A", email: "a@x.io" });
    expect(r.success).toBe(false);
  });
});

describe("bulkImportSchema", () => {
  const valid = { name: "Ada", email: "ada@x.io" };

  it("requires at least one row", () => {
    expect(bulkImportSchema.safeParse([]).success).toBe(false);
  });

  it("accepts a normal batch", () => {
    expect(bulkImportSchema.safeParse([valid, valid]).success).toBe(true);
  });

  it("rejects a batch over the cap", () => {
    const tooMany = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => valid);
    expect(bulkImportSchema.safeParse(tooMany).success).toBe(false);
  });
});
