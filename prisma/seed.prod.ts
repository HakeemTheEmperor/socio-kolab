import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  ClubStatus,
  Role,
  MemberStatus,
} from "../src/generated/prisma/client";

/**
 * Production seed — the real first club and its president, nothing else.
 *
 * This is deliberately unlike `prisma/seed.ts` (the demo seed) in two ways that
 * matter on a live database:
 *
 *  1. It never deletes. Every write is an upsert keyed on a natural id (club
 *     slug, user email, the membership's {club,user} pair), so running it twice
 *     is a no-op and running it against a populated database touches only the
 *     rows below. The demo seed's opening `deleteMany()` would wipe production.
 *
 *  2. It sets no hardcoded password. The president's password comes from
 *     SEED_PASSWORD, or a random one is generated and printed once. Either way
 *     the credential never lives in source, and re-running never resets a
 *     password the president has since changed (upsert `update` leaves it be).
 *
 * The president's name and email come from the environment, not source: this
 * file is committed to a public repo, so no personal data lives in it. Provide
 * SEED_PRESIDENT_NAME and SEED_PRESIDENT_EMAIL when you run it.
 *
 * Run it separately from the demo seed:
 *
 *   DATABASE_URL="<session pooler :5432>" \
 *   SEED_PRESIDENT_NAME="Full Name" \
 *   SEED_PRESIDENT_EMAIL="you@example.com" \
 *   SEED_PASSWORD="choose-a-strong-one" \
 *   npm run db:seed:prod
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set.");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const CLUB = {
  name: "Socio Kolab",
  slug: "socio-kolab",
  description: "Socio Kolab club portal.",
};

/** The president's identity, kept out of source — see the file header. */
function resolvePresident(): { name: string; email: string } {
  const name = process.env.SEED_PRESIDENT_NAME;
  const email = process.env.SEED_PRESIDENT_EMAIL;
  if (!name || !email) {
    throw new Error(
      "SEED_PRESIDENT_NAME and SEED_PRESIDENT_EMAIL must both be set — this " +
        "seed keeps personal data out of source. See the header of " +
        "prisma/seed.prod.ts.",
    );
  }
  return { name, email };
}

/**
 * Academic-year label like "2026/2027", rolling over in August. The president
 * can change this (and every other setting) in-app; it is only a sensible
 * starting value so the dues period is never blank.
 */
function currentAcademicPeriod(now = new Date()): string {
  const year = now.getFullYear();
  const start = now.getMonth() >= 7 ? year : year - 1; // 7 = August
  return `${start}/${start + 1}`;
}

/**
 * The president's opening password: SEED_PASSWORD if given, else a random one we
 * print once. Returned alongside a flag so we only ever show a credential we
 * actually generated.
 */
function resolvePassword(): { password: string; generated: boolean } {
  const fromEnv = process.env.SEED_PASSWORD;
  if (fromEnv && fromEnv.length > 0) {
    return { password: fromEnv, generated: false };
  }
  // url-safe, ~24 chars; only shown on the run that creates the account.
  return { password: randomBytes(18).toString("base64url"), generated: true };
}

async function main() {
  const { password, generated } = resolvePassword();
  const PRESIDENT = resolvePresident();

  // Only the *first* run should adopt the seed password; later runs must not
  // reset a password the president may have changed. So branch on prior existence.
  const existing = await prisma.user.findUnique({
    where: { email: PRESIDENT.email },
    select: { id: true },
  });
  const passwordHash = await bcrypt.hash(password, 10);

  const club = await prisma.club.upsert({
    where: { slug: CLUB.slug },
    update: {}, // leave a live club's settings/status untouched on re-run
    create: {
      name: CLUB.name,
      slug: CLUB.slug,
      status: ClubStatus.ACTIVE,
      description: CLUB.description,
      approvedAt: new Date(),
      settings: {
        duesAmount: 0,
        currency: "NGN",
        currentPeriod: currentAcademicPeriod(),
        departments: [],
        committees: [],
        // Closed until the president has configured departments, dues, etc.
        // Flip this on in Settings once the club is ready for applications.
        membershipOpen: false,
      },
    },
  });

  const president = await prisma.user.upsert({
    where: { email: PRESIDENT.email },
    update: {}, // never overwrite name or password on re-run
    create: {
      email: PRESIDENT.email,
      name: PRESIDENT.name,
      passwordHash,
    },
  });

  await prisma.membership.upsert({
    where: { clubId_userId: { clubId: club.id, userId: president.id } },
    update: {}, // leave role/status as they are if the membership exists
    create: {
      clubId: club.id,
      userId: president.id,
      role: Role.PRESIDENT,
      status: MemberStatus.ACTIVE,
    },
  });

  console.log("Production seed complete:");
  console.log(`  Club:      ${club.name}  (/${club.slug})`);
  console.log(`  President: ${president.name} <${president.email}>`);
  if (existing) {
    console.log(
      "  Password:  unchanged — this account already existed, so its password " +
        "was left as-is.",
    );
  } else if (generated) {
    console.log(`  Password:  ${password}`);
    console.log(
      "             ^ generated — save it now, then change it in-app.",
    );
  } else {
    console.log("  Password:  as provided in SEED_PASSWORD.");
  }
  console.log("  Applications are CLOSED until you enable them in Settings.");
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
