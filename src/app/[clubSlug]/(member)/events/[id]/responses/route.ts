import { prisma } from "@/lib/prisma";
import { requireClubAccess } from "@/lib/club-context";
import { can } from "@/lib/permissions";
import { parseFormSchema } from "@/lib/event-forms";
import {
  deriveResponseColumns,
  responseCellCsv,
  toCsv,
} from "@/lib/event-responses";
import { formatDateTime } from "@/lib/format";
import { slugify } from "@/lib/slug";

/**
 * CSV export of an event's registration responses (EVENT-FORMS.md §5.2).
 *
 * A route handler (not a server action) so the browser downloads natively via
 * Content-Disposition. Route handlers bypass the `(member)` layout guard, so it
 * re-runs the same checks itself: `requireClubAccess` (redirects a non-exec) plus
 * a compound `{ id, clubId }` fetch (another club's event id must not resolve).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clubSlug: string; id: string }> },
) {
  const { clubSlug, id } = await params;
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "event:manage")) {
    return new Response("Forbidden", { status: 403 });
  }

  const event = await prisma.event.findFirst({
    where: { id, clubId: club.id },
    include: { attendance: { include: { membership: { include: { user: true } } } } },
  });
  if (!event) return new Response("Not found", { status: 404 });

  const formSchema = parseFormSchema(event.formSchema);
  const rows = event.attendance
    .map((a) => ({
      name: a.membership?.user.name ?? a.guestName ?? "—",
      email: a.membership?.user.email ?? a.guestEmail ?? "—",
      registeredAt: a.createdAt,
      isGuest: a.membershipId === null,
      responses: asResponses(a.formResponses),
    }))
    .sort((a, b) => a.registeredAt.getTime() - b.registeredAt.getTime());

  const columns = deriveResponseColumns(
    formSchema,
    rows.map((r) => r.responses),
  );

  const header = ["Name", "Email", "Registered at", "Type", ...columns.map((c) => c.label)];
  const body = rows.map((r) => [
    r.name,
    r.email,
    formatDateTime(r.registeredAt),
    r.isGuest ? "Guest" : "Member",
    ...columns.map((c) => responseCellCsv(r.responses[c.id])),
  ]);

  // Leading BOM (U+FEFF) so Excel opens it as UTF-8.
  const BOM = String.fromCharCode(0xfeff);
  const csv = BOM + toCsv([header, ...body]);
  const filename = `${slugify(event.title) || "event"}-responses.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function asResponses(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
