import { Download, Inbox } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { type FormField } from "@/lib/event-forms";
import {
  deriveResponseColumns,
  responseCellText,
} from "@/lib/event-responses";
import { CopyRegisterLink } from "../copy-register-link";

export type ResponseRow = {
  id: string;
  name: string;
  email: string;
  registeredAt: Date;
  isGuest: boolean;
  responses: Record<string, unknown>;
};

/**
 * Exec Responses view (EVENT-FORMS.md §5.1). Columns: Name, Email, Registered at,
 * Type, then the form fields in current order, then any "(removed field)" columns
 * — the same derivation the CSV export uses (`deriveResponseColumns`).
 */
export function ResponsesSection({
  clubSlug,
  eventId,
  formSchema,
  rows,
}: {
  clubSlug: string;
  eventId: string;
  formSchema: FormField[];
  rows: ResponseRow[];
}) {
  const columns = deriveResponseColumns(
    formSchema,
    rows.map((r) => r.responses),
  );
  const memberCount = rows.filter((r) => !r.isGuest).length;
  const guestCount = rows.length - memberCount;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {rows.length} {rows.length === 1 ? "response" : "responses"}
          {rows.length > 0 ? ` · ${memberCount} members, ${guestCount} guests` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <CopyRegisterLink eventId={eventId} />
          {rows.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              render={<a href={`/${clubSlug}/events/${eventId}/responses`} />}
            >
              <Download aria-hidden className="size-4" />
              Export CSV
            </Button>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-muted">
            <Inbox aria-hidden className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No responses yet</p>
          <p className="text-[13px] text-muted-foreground">
            Share the registration link to start collecting responses.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop: horizontally scrollable table, sticky first column. */}
          <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 font-medium">
                    Name
                  </th>
                  <Th>Email</Th>
                  <Th>Registered</Th>
                  <Th>Type</Th>
                  {columns.map((c) => (
                    <th
                      key={c.id}
                      className={`px-3 py-2 font-medium whitespace-nowrap ${
                        c.removed ? "text-muted-foreground italic" : ""
                      }`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium whitespace-nowrap"
                    >
                      {r.name}
                    </th>
                    <Td>{r.email}</Td>
                    <Td>{formatDateTime(r.registeredAt)}</Td>
                    <Td>
                      <Badge variant={r.isGuest ? "neutral" : "info"}>
                        {r.isGuest ? "Guest" : "Member"}
                      </Badge>
                    </Td>
                    {columns.map((c) => (
                      <td key={c.id} className="px-3 py-2 whitespace-nowrap">
                        {responseCellText(r.responses[c.id])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: one card per response. */}
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {r.email}
                    </p>
                  </div>
                  <Badge variant={r.isGuest ? "neutral" : "info"}>
                    {r.isGuest ? "Guest" : "Member"}
                  </Badge>
                </div>
                <dl className="mt-3 space-y-1.5 text-[13px]">
                  <Row label="Registered" value={formatDateTime(r.registeredAt)} />
                  {columns.map((c) => (
                    <Row
                      key={c.id}
                      label={c.label}
                      value={responseCellText(r.responses[c.id])}
                      removed={c.removed}
                    />
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium whitespace-nowrap">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 whitespace-nowrap">{children}</td>;
}

function Row({
  label,
  value,
  removed,
}: {
  label: string;
  value: string;
  removed?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={`text-muted-foreground ${removed ? "italic" : ""}`}>{label}</dt>
      <dd className="text-right wrap-break-word">{value}</dd>
    </div>
  );
}
