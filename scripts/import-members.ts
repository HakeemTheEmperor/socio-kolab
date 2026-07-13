import "dotenv/config";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  MemberStatus,
  Role,
} from "../src/generated/prisma/client";

/**
 * Bulk-import members from a CSV with header: name,email,phone,department,level
 *
 * Usage:
 *   npm run import:members -- --club <slug> path/to/members.csv [defaultPassword]
 *
 * Creates User + Membership (ACTIVE) rows in the named club. Exec manual-adds
 * bypass the `membershipOpen` toggle by design — it gates self-service
 * applications, not the club's own roster management.
 *
 * Each imported user is flagged mustChangePassword=true so the default password
 * must be changed on first login. Existing emails are skipped (idempotent).
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set.");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const EXPECTED_HEADER = ["name", "email", "phone", "department", "level"];

/** Minimal RFC-4180-ish CSV parser (handles quoted fields and escaped quotes). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty trailing rows.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const USAGE =
  "Usage: npm run import:members -- --club <slug> <path/to/members.csv> [defaultPassword]";

async function main() {
  const args = process.argv.slice(2);
  const clubFlag = args.indexOf("--club");
  if (clubFlag === -1 || !args[clubFlag + 1]) {
    throw new Error(`Missing --club <slug>.\n${USAGE}`);
  }
  const clubSlug = args[clubFlag + 1];

  // Everything that isn't the --club flag or its value is positional.
  const positional = args.filter(
    (_, i) => i !== clubFlag && i !== clubFlag + 1,
  );
  const csvPath = positional[0];
  const defaultPassword = positional[1] ?? "changeme123";
  if (!csvPath) {
    throw new Error(`Missing CSV path.\n${USAGE}`);
  }

  const club = await prisma.club.findUnique({ where: { slug: clubSlug } });
  if (!club) {
    throw new Error(
      `No club with slug "${clubSlug}". Run \`npm run db:seed\` or check the slug.`,
    );
  }

  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  if (rows.length === 0) throw new Error("CSV is empty.");

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const ok = EXPECTED_HEADER.every((h, idx) => header[idx] === h);
  if (!ok) {
    throw new Error(
      `Unexpected CSV header. Expected: ${EXPECTED_HEADER.join(",")}. Got: ${header.join(",")}`,
    );
  }

  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  let created = 0;
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const [name, email, phone, department, level] = rows[i].map((c) => c.trim());
    if (!name || !email) {
      console.warn(`Row ${i + 1}: missing name or email — skipped.`);
      skipped++;
      continue;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.warn(`Row ${i + 1}: ${email} already exists — skipped.`);
      skipped++;
      continue;
    }

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        mustChangePassword: true,
      },
    });
    await prisma.membership.create({
      data: {
        clubId: club.id,
        userId: user.id,
        role: Role.MEMBER,
        status: MemberStatus.ACTIVE,
        phone: phone || null,
        department: department || null,
        level: level || null,
      },
    });
    created++;
  }

  console.log(
    `Import into ${club.name} (/${club.slug}) complete: ${created} created, ${skipped} skipped.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
