import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MessagesSquare } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireClubAccess, requirePartnerInClub } from "@/lib/club-context";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/format";

import { EmptyState } from "@/components/empty-state";
import { Avatar } from "@/components/date-block";
import { Badge } from "@/components/ui/badge";
import { PartnerDialog } from "../partner-dialog";
import { ArchivePartnerButton } from "../archive-partner-button";
import { AddNoteForm } from "../add-note-form";

export const metadata: Metadata = { title: "Partner — Club Portal" };

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ clubSlug: string; id: string }>;
}) {
  const { clubSlug, id } = await params;
  // Both lookups are cache()d — shared with the layout that already 404-guarded
  // this id and the caller's right to see it.
  const { club, membership: me } = await requireClubAccess(clubSlug);
  const partner = await requirePartnerInClub(club.id, id);
  const isExec = can(me, "partner:manage");

  const [notes, members] = await Promise.all([
    prisma.partnerNote.findMany({
      where: { partnerId: partner.id },
      include: { author: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    // The edit dialog's liaison picker — execs only.
    isExec
      ? prisma.membership.findMany({
          where: { clubId: club.id, status: "ACTIVE" },
          include: { user: { select: { name: true } } },
          orderBy: { user: { name: "asc" } },
        })
      : Promise.resolve([]),
  ]);

  const liaisonInactive =
    partner.liaison !== null && partner.liaison.status !== "ACTIVE";

  return (
    <div className="space-y-6">
      <Link
        href={`/${clubSlug}/partners`}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden strokeWidth={1.75} className="size-4" />
        All partners
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={partner.name} />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-medium">{partner.name}</h1>
            <p className="truncate text-[13px] text-muted-foreground">
              Partner since {formatDate(partner.createdAt)}
            </p>
          </div>
          {partner.archivedAt ? <Badge variant="neutral">Archived</Badge> : null}
        </div>
        {isExec ? (
          <div className="flex shrink-0 gap-2">
            {!partner.archivedAt ? (
              <PartnerDialog
                members={members.map((m) => ({
                  id: m.id,
                  name: m.user.name,
                  role: m.role,
                }))}
                partner={{
                  id: partner.id,
                  name: partner.name,
                  email: partner.email,
                  phone: partner.phone,
                  contactPerson: partner.contactPerson,
                  liaisonId: partner.liaisonId,
                }}
              />
            ) : null}
            <ArchivePartnerButton
              partnerId={partner.id}
              name={partner.name}
              archived={partner.archivedAt !== null}
            />
          </div>
        ) : null}
      </div>

      {isExec && !partner.archivedAt && (partner.liaison === null || liaisonInactive) ? (
        <div className="rounded-xl rounded-l-none border border-l-4 border-border border-l-warning bg-warning-tint px-4 py-3 text-sm text-warning-tint-fg">
          {partner.liaison === null
            ? "No liaison officer is assigned. Assign one so this relationship has an owner."
            : `${partner.liaison.user.name} is no longer an active member. Reassign the liaison so the contact isn't lost.`}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Contact card */}
        <section className="h-fit rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-[15px] font-medium">Contact</h2>
          </div>
          <dl className="space-y-4 px-6 py-4">
            <Field
              label="Email"
              value={
                <a href={`mailto:${partner.email}`} className="hover:underline">
                  {partner.email}
                </a>
              }
            />
            <Field label="Phone" value={partner.phone ?? "—"} />
            <Field label="Contact person" value={partner.contactPerson ?? "—"} />
            <Field
              label="Liaison officer"
              value={
                partner.liaison ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {partner.liaison.user.name}
                    {liaisonInactive && isExec ? (
                      <Badge variant="warning">Inactive</Badge>
                    ) : null}
                  </span>
                ) : (
                  "—"
                )
              }
            />
          </dl>
        </section>

        {/* Interaction log */}
        <section className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-[15px] font-medium">
              Interaction log{notes.length > 0 ? ` (${notes.length})` : ""}
            </h2>
            <p className="text-[13px] text-muted-foreground">
              Every entry is kept — the log is the club&apos;s memory of this
              relationship.
            </p>
          </div>

          {!partner.archivedAt ? (
            <div className="border-b border-border px-6 py-4">
              <AddNoteForm partnerId={partner.id} />
            </div>
          ) : null}

          {notes.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              message="No log entries yet. Record calls, meetings, and agreements here."
            />
          ) : (
            <div className="divide-y divide-border">
              {notes.map((note) => (
                <div key={note.id} className="space-y-1 px-6 py-4">
                  <p className="text-[13px] text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {note.author.user.name}
                    </span>{" "}
                    · {formatDateTime(note.createdAt)}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
