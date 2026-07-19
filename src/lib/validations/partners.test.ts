import { describe, expect, it } from "vitest";

import { partnerNoteSchema, partnerSchema } from "./partners";

describe("partnerSchema", () => {
  const valid = {
    name: "Tech Hub Lagos",
    email: "Hello@TechHub.NG",
    phone: "",
    contactPerson: "  Bola Ade  ",
    liaisonId: "",
  };

  it("accepts a valid partner and normalizes fields", () => {
    const parsed = partnerSchema.parse(valid);
    expect(parsed.email).toBe("hello@techhub.ng");
    expect(parsed.contactPerson).toBe("Bola Ade");
    expect(parsed.phone).toBeNull();
    expect(parsed.liaisonId).toBeNull();
  });

  it("rejects a too-short name", () => {
    expect(partnerSchema.safeParse({ ...valid, name: "A" }).success).toBe(false);
  });

  it("rejects a bad email", () => {
    expect(partnerSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });
});

describe("partnerNoteSchema", () => {
  it("accepts and trims a body", () => {
    expect(partnerNoteSchema.parse({ body: "  Met at the fair.  " }).body).toBe(
      "Met at the fair.",
    );
  });

  it("rejects an empty or whitespace-only body", () => {
    expect(partnerNoteSchema.safeParse({ body: "" }).success).toBe(false);
    expect(partnerNoteSchema.safeParse({ body: "   " }).success).toBe(false);
  });

  it("rejects a body over 2000 characters", () => {
    expect(partnerNoteSchema.safeParse({ body: "x".repeat(2001) }).success).toBe(false);
  });
});
