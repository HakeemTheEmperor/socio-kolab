import { describe, expect, it } from "vitest";

import {
  buildResponseValidator,
  coreRegistrantSchema,
  FIELD_PREFIX,
  FormSchemaSchema,
  LABEL_MAX,
  MAX_FIELDS,
  OPTION_MAX,
  parseFormSchema,
  TEXT_MAX,
  type FormField,
} from "./event-forms";

// A minimal valid field of each kind, for assembling test schemas.
const field = (over: Partial<FormField> & Pick<FormField, "id" | "type">): FormField => ({
  label: "Question",
  required: false,
  ...over,
});

const key = (id: string) => `${FIELD_PREFIX}${id}`;

describe("FormSchemaSchema", () => {
  it("accepts a well-formed schema with all five types", () => {
    const schema = [
      field({ id: "a1", type: "text", label: "Full name" }),
      field({ id: "a2", type: "textarea", label: "Bio" }),
      field({ id: "a3", type: "number", label: "Age" }),
      field({ id: "a4", type: "checkbox", label: "I agree" }),
      field({ id: "a5", type: "select", label: "Size", options: ["S", "M", "L"] }),
    ];
    expect(FormSchemaSchema.safeParse(schema).success).toBe(true);
  });

  it("accepts an empty form", () => {
    expect(FormSchemaSchema.safeParse([]).success).toBe(true);
  });

  it("rejects more than the field cap", () => {
    const many = Array.from({ length: MAX_FIELDS + 1 }, (_, i) =>
      field({ id: `f${i}`, type: "text" }),
    );
    expect(FormSchemaSchema.safeParse(many).success).toBe(false);
  });

  it("rejects duplicate ids", () => {
    const dupes = [
      field({ id: "same", type: "text" }),
      field({ id: "same", type: "number" }),
    ];
    const result = FormSchemaSchema.safeParse(dupes);
    expect(result.success).toBe(false);
  });

  it("rejects an empty label", () => {
    expect(
      FormSchemaSchema.safeParse([field({ id: "x", type: "text", label: "" })]).success,
    ).toBe(false);
  });

  it("rejects a label past the max", () => {
    const long = "a".repeat(LABEL_MAX + 1);
    expect(
      FormSchemaSchema.safeParse([field({ id: "x", type: "text", label: long })]).success,
    ).toBe(false);
  });

  it("rejects a select with no options", () => {
    expect(
      FormSchemaSchema.safeParse([field({ id: "x", type: "select", options: [] })]).success,
    ).toBe(false);
    expect(
      FormSchemaSchema.safeParse([field({ id: "y", type: "select" })]).success,
    ).toBe(false);
  });

  it("rejects a select with an empty option or too many options", () => {
    expect(
      FormSchemaSchema.safeParse([
        field({ id: "x", type: "select", options: ["ok", ""] }),
      ]).success,
    ).toBe(false);
    const tooMany = Array.from({ length: 21 }, (_, i) => `opt${i}`);
    expect(
      FormSchemaSchema.safeParse([
        field({ id: "y", type: "select", options: tooMany }),
      ]).success,
    ).toBe(false);
  });

  it("rejects options on a non-select field", () => {
    expect(
      FormSchemaSchema.safeParse([
        field({ id: "x", type: "text", options: ["nope"] }),
      ]).success,
    ).toBe(false);
  });

  it("rejects an unknown field type", () => {
    expect(
      FormSchemaSchema.safeParse([{ id: "x", type: "email", label: "E", required: false }])
        .success,
    ).toBe(false);
  });

  it("rejects an option past the max length", () => {
    const long = "o".repeat(OPTION_MAX + 1);
    expect(
      FormSchemaSchema.safeParse([field({ id: "x", type: "select", options: [long] })])
        .success,
    ).toBe(false);
  });
});

describe("parseFormSchema", () => {
  const valid: FormField[] = [field({ id: "a", type: "text", label: "Name" })];

  it("parses an already-decoded array", () => {
    expect(parseFormSchema(valid)).toEqual(valid);
  });

  it("parses a JSON string", () => {
    expect(parseFormSchema(JSON.stringify(valid))).toEqual(valid);
  });

  it("falls back to [] on malformed JSON", () => {
    expect(parseFormSchema("{not json")).toEqual([]);
  });

  it("falls back to [] on a schema-invalid value", () => {
    expect(parseFormSchema([{ id: "a", type: "nope" }])).toEqual([]);
    expect(parseFormSchema(null)).toEqual([]);
    expect(parseFormSchema(42)).toEqual([]);
  });
});

describe("buildResponseValidator — keying and stripping", () => {
  it("keys the result by field id, not by the custom_ input name", () => {
    const schema = [field({ id: "abc", type: "text", label: "Name", required: true })];
    const result = buildResponseValidator(schema).safeParse({ [key("abc")]: "Ada" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ abc: "Ada" });
  });

  it("rejects unknown custom_ keys (strict)", () => {
    const schema = [field({ id: "abc", type: "text" })];
    const result = buildResponseValidator(schema).safeParse({
      [key("abc")]: "hi",
      [key("ghost")]: "sneaky",
    });
    expect(result.success).toBe(false);
  });
});

describe("buildResponseValidator — required vs optional", () => {
  it("requires a required text field to be non-empty", () => {
    const v = buildResponseValidator([field({ id: "t", type: "text", required: true })]);
    expect(v.safeParse({ [key("t")]: "" }).success).toBe(false);
    expect(v.safeParse({}).success).toBe(false);
    expect(v.safeParse({ [key("t")]: "hello" }).success).toBe(true);
  });

  it("omits an optional field left blank", () => {
    const v = buildResponseValidator([field({ id: "t", type: "text", required: false })]);
    const result = v.safeParse({ [key("t")]: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({});
  });

  it("enforces the text length cap", () => {
    const v = buildResponseValidator([field({ id: "t", type: "text" })]);
    expect(v.safeParse({ [key("t")]: "x".repeat(TEXT_MAX + 1) }).success).toBe(false);
  });
});

describe("buildResponseValidator — number", () => {
  const v = buildResponseValidator([field({ id: "n", type: "number", required: true })]);

  it("coerces a numeric string", () => {
    const result = v.safeParse({ [key("n")]: "42" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ n: 42 });
  });

  it("rejects a non-numeric value", () => {
    expect(v.safeParse({ [key("n")]: "abc" }).success).toBe(false);
  });

  it("rejects a required number left blank (does not coerce '' to 0)", () => {
    expect(v.safeParse({ [key("n")]: "" }).success).toBe(false);
    expect(v.safeParse({}).success).toBe(false);
  });

  it("omits an optional number left blank", () => {
    const opt = buildResponseValidator([field({ id: "n", type: "number", required: false })]);
    const result = opt.safeParse({ [key("n")]: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({});
  });
});

describe("buildResponseValidator — select enforces the configured options", () => {
  const schema = [field({ id: "s", type: "select", options: ["S", "M", "L"], required: true })];
  const v = buildResponseValidator(schema);

  it("accepts a value in the option set", () => {
    const result = v.safeParse({ [key("s")]: "M" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ s: "M" });
  });

  it("rejects a value outside the option set (never stored)", () => {
    expect(v.safeParse({ [key("s")]: "XL" }).success).toBe(false);
  });
});

describe("buildResponseValidator — checkbox by presence", () => {
  it("stores true when present and false when absent (optional)", () => {
    const v = buildResponseValidator([field({ id: "c", type: "checkbox", required: false })]);
    const on = v.safeParse({ [key("c")]: "on" });
    expect(on.success && on.data).toEqual({ c: true });
    const off = v.safeParse({});
    expect(off.success && off.data).toEqual({ c: false });
  });

  it("requires a required checkbox to be checked", () => {
    const v = buildResponseValidator([field({ id: "c", type: "checkbox", required: true })]);
    expect(v.safeParse({}).success).toBe(false);
    const on = v.safeParse({ [key("c")]: "on" });
    expect(on.success && on.data).toEqual({ c: true });
  });
});

describe("coreRegistrantSchema", () => {
  it("trims and lowercases the email", () => {
    const result = coreRegistrantSchema.safeParse({
      name: "  Ada Obi  ",
      email: "  ADA@Example.COM ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Ada Obi");
      expect(result.data.email).toBe("ada@example.com");
    }
  });

  it("rejects a blank name and a malformed email", () => {
    expect(coreRegistrantSchema.safeParse({ name: "", email: "a@b.com" }).success).toBe(false);
    expect(coreRegistrantSchema.safeParse({ name: "Ada", email: "not-email" }).success).toBe(
      false,
    );
  });
});
