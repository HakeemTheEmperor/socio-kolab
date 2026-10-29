import { mkdirSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import fc from "fast-check";
import { nanoid } from "nanoid";
import { arrayMove } from "@dnd-kit/sortable";

import {
  FIELD_TYPES,
  MAX_FIELDS,
  FormSchemaSchema,
  buildResponseValidator,
  FIELD_PREFIX,
  type FormField,
  type FieldType,
} from "@/lib/event-forms";
import { deriveResponseColumns, responseCellCsv } from "@/lib/event-responses";

/**
 * Randomised check that schema edits never lose or misplace collected answers.
 *
 * The edit operators copy what form-builder.tsx does to the field array
 * (map / filter / append / dnd-kit's arrayMove). Reporting goes through the real
 * deriveResponseColumns + responseCellCsv (the exec table and the CSV export), and
 * new submissions go through the real buildResponseValidator. The oracle does NOT use
 * field ids: it locates each answer by the *header text* of the question it belongs to.
 */

type Q = { qid: number; field: FormField };
type Answer = { qid: number; value: string | number | boolean };
type Resp = { stored: Record<string, unknown>; answers: Answer[] };

const NUM_FORMS = Number(process.env.FORMS ?? 2000);
const SEED = Number(process.env.SEED ?? 20260101);

const op = fc.oneof(
  fc.record({ k: fc.constant("add" as const), type: fc.constantFrom(...FIELD_TYPES) }),
  fc.record({ k: fc.constant("remove" as const), at: fc.nat(1000) }),
  fc.record({ k: fc.constant("rename" as const), at: fc.nat(1000), blank: fc.boolean() }),
  fc.record({ k: fc.constant("reorder" as const), from: fc.nat(1000), to: fc.nat(1000) }),
  fc.record({ k: fc.constant("required" as const), at: fc.nat(1000) }),
  fc.record({ k: fc.constant("options" as const), at: fc.nat(1000) }),
  fc.record({ k: fc.constant("respond" as const), n: fc.integer({ min: 1, max: 3 }) }),
  fc.record({ k: fc.constant("save" as const) }),
);

const stats = {
  forms: 0, edits: 0, savesAccepted: 0, savesRejected: 0,
  responsesSubmitted: 0, submissionsRejectedWrongly: 0,
  answersChecked: 0, answersLost: 0, answersMisattached: 0,
  answersInRemovedColumns: 0, columnsMislabelled: 0, tablesChecked: 0,
  byOp: {} as Record<string, number>,
};

function sampleValue(f: FormField, i: number): string | number | boolean {
  switch (f.type) {
    case "text": case "textarea": return `ans-${i}-${f.id.slice(0, 4)}`;
    case "number": return i + 1;
    case "checkbox": return true;
    case "select": return f.options![i % f.options!.length];
  }
}

function check(saved: Q[], responses: Resp[]) {
  const schema = saved.map((q) => q.field);
  const columns = deriveResponseColumns(schema, responses.map((r) => r.stored));
  const header = columns.map((c) => c.label);
  const table = responses.map((r) => columns.map((c) => responseCellCsv(r.stored[c.id])));
  stats.tablesChecked++;
  const liveLabels = new Set(schema.map((f) => f.label));
  // Labels are unique in this test, so a header text identifies one question.
  for (let ri = 0; ri < responses.length; ri++) {
    for (const a of responses[ri].answers) {
      stats.answersChecked++;
      const q = saved.find((s) => s.qid === a.qid);
      const want = responseCellCsv(a.value);
      if (q) {
        const col = header.indexOf(q.field.label);
        if (col < 0) { stats.answersLost++; continue; }
        if (table[ri][col] !== want) {
          // Present somewhere else in the row? then it is attached to the wrong column.
          if (table[ri].includes(want)) stats.answersMisattached++; else stats.answersLost++;
        }
      } else {
        // Field removed: the answer must survive under a "(removed field)" column.
        const inRemoved = columns.some((c, ci) => c.removed && table[ri][ci] === want);
        if (inRemoved) stats.answersInRemovedColumns++; else stats.answersLost++;
      }
    }
  }
  for (const c of columns) {
    if (!c.removed && !liveLabels.has(c.label)) stats.columnsMislabelled++;
  }
}

describe("form builder data safety", () => {
  it("random edits never lose or misplace answers", () => {
    let qidCounter = 0;
    let labelCounter = 0;
    const freshLabel = () => `Question ${++labelCounter}`;

    fc.assert(
      fc.property(fc.array(op, { minLength: 40, maxLength: 120 }), (ops) => {
        stats.forms++;
        let draft: Q[] = [];
        let saved: Q[] = [];
        const responses: Resp[] = [];
        const pick = (at: number) => (draft.length ? at % draft.length : -1);
        const clone = (qs: Q[]) => qs.map((q) => ({ qid: q.qid, field: structuredClone(q.field) }));

        for (const o of ops) {
          stats.edits++;
          stats.byOp[o.k] = (stats.byOp[o.k] ?? 0) + 1;
          switch (o.k) {
            case "add": {
              if (draft.length >= MAX_FIELDS) break; // builder disables Add at 20
              const type: FieldType = o.type;
              draft = [...draft, { qid: ++qidCounter, field: {
                id: nanoid(), type, label: freshLabel(), required: false,
                ...(type === "select" ? { options: ["Option 1"] } : {}),
              } }];
              break;
            }
            case "remove": {
              const i = pick(o.at); if (i < 0) break;
              draft = draft.filter((_, j) => j !== i); break;
            }
            case "rename": {
              const i = pick(o.at); if (i < 0) break;
              draft = draft.map((q, j) => j === i ? { ...q, field: { ...q.field, label: o.blank ? "" : freshLabel() } } : q);
              break;
            }
            case "reorder": {
              if (draft.length < 2) break;
              draft = arrayMove(draft, o.from % draft.length, o.to % draft.length); break;
            }
            case "required": {
              const i = pick(o.at); if (i < 0) break;
              draft = draft.map((q, j) => j === i ? { ...q, field: { ...q.field, required: !q.field.required } } : q);
              break;
            }
            case "options": {
              const i = pick(o.at); if (i < 0 || draft[i].field.type !== "select") break;
              const opts = draft[i].field.options ?? [];
              draft = draft.map((q, j) => j === i ? { ...q, field: { ...q.field, options: [...opts.map((x) => x + "'"), `Option ${opts.length + 1}`].slice(0, 20) } } : q);
              break;
            }
            case "respond": {
              // Public submit path: validate against the SAVED schema, store keyed by id.
              if (saved.length === 0) break;
              for (let n = 0; n < o.n; n++) {
                const input: Record<string, unknown> = {};
                const answers: Answer[] = [];
                saved.forEach((q) => {
                  const v = sampleValue(q.field, responses.length + n);
                  input[`${FIELD_PREFIX}${q.field.id}`] = v === true ? "on" : String(v);
                  answers.push({ qid: q.qid, value: v });
                });
                const parsed = buildResponseValidator(saved.map((q) => q.field)).safeParse(input);
                if (!parsed.success) { stats.submissionsRejectedWrongly++; continue; }
                stats.responsesSubmitted++;
                responses.push({ stored: parsed.data, answers });
              }
              break;
            }
            case "save": {
              // updateEvent validates with FormSchemaSchema; failure leaves the DB untouched.
              if (FormSchemaSchema.safeParse(draft.map((q) => q.field)).success) {
                saved = clone(draft); stats.savesAccepted++;
              } else stats.savesRejected++;
              break;
            }
          }
          if (o.k === "save" && responses.length) check(saved, responses);
        }
        // Final: always try to save then check once more.
        if (FormSchemaSchema.safeParse(draft.map((q) => q.field)).success) saved = clone(draft);
        if (responses.length) check(saved, responses);
        return stats.answersLost === 0 && stats.answersMisattached === 0 && stats.columnsMislabelled === 0;
      }),
      { numRuns: NUM_FORMS, seed: SEED },
    );

    mkdirSync("metrics/results", { recursive: true });
    writeFileSync("metrics/results/form-builder-safety.json", JSON.stringify({ seed: SEED, ...stats }, null, 2));
    console.log(JSON.stringify(stats, null, 2));
  });
});
