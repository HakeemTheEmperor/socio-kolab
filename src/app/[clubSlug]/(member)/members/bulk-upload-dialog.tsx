"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  dedupeByEmail,
  parseMemberRows,
} from "@/lib/members-import";
import { importRowSchema } from "@/lib/validations/members";
import { bulkImportMembers, type ImportSummary } from "./actions";

type PreviewRow = {
  line: number;
  name: string;
  email: string;
  status: "ok" | "error" | "duplicate";
  message?: string;
};

/** Parse + validate the raw text client-side for the preview. The server re-does
 *  all of this on submit — this is UX only, never the security boundary. */
function buildPreview(raw: string): PreviewRow[] {
  const parsed = parseMemberRows(raw);
  const { duplicates } = dedupeByEmail(parsed);
  const dupLines = new Set(duplicates.map((r) => r.line));
  return parsed.map((row) => {
    if (dupLines.has(row.line)) {
      return {
        line: row.line,
        name: row.name,
        email: row.email,
        status: "duplicate",
        message: "Duplicate email",
      };
    }
    const check = importRowSchema.safeParse(row);
    if (!check.success) {
      return {
        line: row.line,
        name: row.name,
        email: row.email,
        status: "error",
        message: check.error.issues[0]?.message ?? "Invalid",
      };
    }
    return { line: row.line, name: row.name, email: row.email, status: "ok" };
  });
}

export function BulkUploadDialog() {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [pending, startTransition] = useTransition();

  const preview = useMemo(() => buildPreview(raw), [raw]);
  const importable = preview.filter((r) => r.status === "ok").length;

  function reset() {
    setRaw("");
    setSummary(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setRaw(await file.text());
  }

  function submit() {
    startTransition(async () => {
      const result = await bulkImportMembers(clubSlug, raw);
      if (!result.ok) {
        toast.error(result.error ?? "Import failed.");
        return;
      }
      setSummary(result);
      const added = result.created + result.addedExisting;
      toast.success(
        added > 0 ? `Imported ${added} member${added === 1 ? "" : "s"}.` : "Import finished.",
      );
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        Import members
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import members</DialogTitle>
          <DialogDescription>
            Upload a CSV or paste rows: name, email, phone, department, level.
            Each new member is emailed a link to set their own password.
          </DialogDescription>
        </DialogHeader>

        {summary ? (
          <ImportResult summary={summary} />
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csv-file">Upload a CSV file</Label>
              <input
                id="csv-file"
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => onFile(e.target.files?.[0])}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="csv-paste">Or paste rows</Label>
              <Textarea
                id="csv-paste"
                rows={6}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={"Ada Lovelace,ada@example.io,0801,Computer Science,300"}
                className="font-mono text-[13px]"
              />
            </div>

            {preview.length > 0 ? <PreviewTable rows={preview} /> : null}
          </div>
        )}

        <DialogFooter>
          {summary ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button onClick={submit} disabled={pending || importable === 0}>
                {pending
                  ? "Importing…"
                  : `Import ${importable} member${importable === 1 ? "" : "s"}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  const ok = rows.filter((r) => r.status === "ok").length;
  const bad = rows.length - ok;
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-muted-foreground">
        {ok} ready to import
        {bad > 0 ? ` · ${bad} will be skipped` : ""}
      </p>
      <div className="max-h-64 overflow-y-auto rounded-md border border-border">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-medium">Name</th>
              <th className="px-3 py-1.5 font-medium">Email</th>
              <th className="px-3 py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.line} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5">{r.name || "—"}</td>
                <td className="px-3 py-1.5">{r.email || "—"}</td>
                <td className="px-3 py-1.5">
                  {r.status === "ok" ? (
                    <span className="text-success">Ready</span>
                  ) : (
                    <span className="text-destructive">{r.message}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportResult({ summary }: { summary: ImportSummary }) {
  return (
    <div className="space-y-3 text-sm">
      <ul className="space-y-1">
        <li>
          <span className="font-medium">{summary.created}</span> new member
          {summary.created === 1 ? "" : "s"} created and invited
        </li>
        <li>
          <span className="font-medium">{summary.addedExisting}</span> existing
          account{summary.addedExisting === 1 ? "" : "s"} added to this club
        </li>
        <li>
          <span className="font-medium">{summary.skipped}</span> skipped
        </li>
        {summary.invitesFailed > 0 ? (
          <li className="text-warning">
            {summary.invitesFailed} invite email
            {summary.invitesFailed === 1 ? "" : "s"} failed to send
          </li>
        ) : null}
      </ul>

      {summary.rowErrors.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-muted-foreground">
            Rows not imported
          </p>
          <div className="max-h-48 overflow-y-auto rounded-md border border-border">
            <ul className="divide-y divide-border text-[13px]">
              {summary.rowErrors.map((e, i) => (
                <li key={i} className="px-3 py-1.5">
                  <span className="text-muted-foreground">Row {e.line}:</span>{" "}
                  {e.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
