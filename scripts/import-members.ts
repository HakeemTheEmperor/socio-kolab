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
 *   npm run import:members -- path/to/members.csv [defaultPassword]
 *
 * Creates User + Membership (ACTIVE) rows scoped to the single seeded club.
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

async function main() {
  const csvPath = process.argv[2];
  const defaultPassword = process.argv[3] ?? "changeme123";
  if (!csvPath) {
    throw new Error(
      "Usage: npm run import:members -- <path/to/members.csv> [defaultPassword]",
    );
  }

  const club = await prisma.club.findFirst();
  if (!club) {
    throw new Error("No club found. Run `npm run db:seed` first.");
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

  console.log(`Import complete: ${created} created, ${skipped} skipped.`);
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
