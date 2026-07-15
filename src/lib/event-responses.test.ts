import { describe, expect, it } from "vitest";

import {
  csvCell,
  deriveResponseColumns,
  responseCellCsv,
  responseCellText,
  toCsv,
} from "./event-responses";
import type { FormField } from "./event-forms";

const field = (id: string, label: string): FormField => ({
  id,
  label,
  type: "text",
  required: false,
});

describe("deriveResponseColumns", () => {
  it("keeps current schema order", () => {
    const schema = [field("a", "Name"), field("b", "Size")];
    const cols = deriveResponseColumns(schema, [{ a: "x", b: "y" }]);
    expect(cols.map((c) => c.label)).toEqual(["Name", "Size"]);
    expect(cols.every((c) => !c.removed)).toBe(true);
  });

  it("appends orphaned keys once, labelled (removed field)", () => {
    const schema = [field("a", "Name")];
    const cols = deriveResponseColumns(schema, [
      { a: "x", gone: "1" },
      { a: "y", gone: "2", alsoGone: "3" },
    ]);
    expect(cols).toEqual([
      { id: "a", label: "Name", removed: false },
      { id: "gone", label: "(removed field)", removed: true },
      { id: "alsoGone", label: "(removed field)", removed: true },
    ]);
  });

  it("emits schema columns even when nobody answered them", () => {
    const cols = deriveResponseColumns([field("a", "Name")], []);
    expect(cols).toEqual([{ id: "a", label: "Name", removed: false }]);
  });
});

describe("response cell formatting", () => {
  it("renders on-screen checkbox as Yes/—", () => {
    expect(responseCellText(true)).toBe("Yes");
    expect(responseCellText(false)).toBe("—");
    expect(responseCellText(undefined)).toBe("—");
    expect(responseCellText("hi")).toBe("hi");
    expect(responseCellText(3)).toBe("3");
  });

  it("renders CSV checkbox as Yes/No and blanks as empty", () => {
    expect(responseCellCsv(true)).toBe("Yes");
    expect(responseCellCsv(false)).toBe("No");
    expect(responseCellCsv(undefined)).toBe("");
    expect(responseCellCsv(null)).toBe("");
    expect(responseCellCsv("hi")).toBe("hi");
  });
});

describe("csvCell — escaping", () => {
  it("passes plain values through", () => {
    expect(csvCell("Ada Obi")).toBe("Ada Obi");
  });

  it("quotes and doubles quotes for commas, quotes, and newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("csvCell — formula-injection guard", () => {
  it("neutralises leading =, +, -, @", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("guards then quotes when a formula also needs quoting", () => {
    expect(csvCell("=1,2")).toBe(`"'=1,2"`);
  });

  it("leaves an inner = alone", () => {
    expect(csvCell("a=b")).toBe("a=b");
  });
});

describe("toCsv", () => {
  it("joins fields with commas and rows with CRLF", () => {
    const csv = toCsv([
      ["Name", "Note"],
      ["Ada", "=2+2"],
      ["Bo", "a,b"],
    ]);
    expect(csv).toBe(`Name,Note\r\nAda,'=2+2\r\nBo,"a,b"`);
  });
});
