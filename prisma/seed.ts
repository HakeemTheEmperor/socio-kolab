import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  ClubStatus,
  Role,
  MemberStatus,
  RsvpStatus,
} from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set.");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const PASSWORD = "password123";
const PERIOD = "2026/2027";
const LEVELS = ["100", "200", "300", "400", "500"];

/**
 * A member to seed into a club. Users are shared across clubs by email, so
 * listing the same person in two clubs gives them two memberships, one account.
 */
interface MemberSeed {
  name: string;
  role: Role;
  status: MemberStatus;
  /** Override the derived email (used for the memorable login accounts). */
  email?: string;
}

interface ClubSeed {
  name: string;
  slug: string;
  description: string;
  duesAmount: number;
  departments: string[];
  committees: string[];
  membershipOpen: boolean;
  members: MemberSeed[];
}

const DEMO_CLUB: ClubSeed = {
  name: "Demo Club",
  slug: "demo-club",
  description: "The original demo club — open to applications.",
  duesAmount: 2000,
  departments: [
    "Computer Science",
    "Electrical Engineering",
    "Mechanical Engineering",
    "Economics",
  ],
  committees: ["Welfare", "Publicity", "Events"],
  membershipOpen: true,
  members: [
    {
      name: "Amara President",
      role: Role.PRESIDENT,
      status: MemberStatus.ACTIVE,
      email: "president@club.test",
    },
    {
      name: "Kunle Exec",
      role: Role.EXEC,
      status: MemberStatus.ACTIVE,
      email: "exec@club.test",
    },
    // Ada Obi also belongs to Beta Club — she exercises the club switcher.
    { name: "Ada Obi", role: Role.MEMBER, status: MemberStatus.ACTIVE },
    // Chidi Okafor belongs to Demo Club ONLY — he exercises cross-club isolation.
    { name: "Chidi Okafor", role: Role.MEMBER, status: MemberStatus.ACTIVE },
    { name: "Bola Adeyemi", role: Role.MEMBER, status: MemberStatus.ACTIVE },
    { name: "Emeka Nwosu", role: Role.MEMBER, status: MemberStatus.ACTIVE },
    { name: "Fatima Bello", role: Role.MEMBER, status: MemberStatus.ACTIVE },
    { name: "Grace Eze", role: Role.MEMBER, status: MemberStatus.ACTIVE },
    { name: "Ibrahim Sani", role: Role.MEMBER, status: MemberStatus.ACTIVE },
    { name: "Ngozi Uche", role: Role.MEMBER, status: MemberStatus.ACTIVE },
    { name: "Segun Balogun", role: Role.MEMBER, status: MemberStatus.ACTIVE },
    { name: "Zainab Yusuf", role: Role.MEMBER, status: MemberStatus.ACTIVE },
    { name: "Tunde Alabi", role: Role.MEMBER, status: MemberStatus.PENDING },
    { name: "Rita Okon", role: Role.MEMBER, status: MemberStatus.PENDING },
  ],
};

const BETA_CLUB: ClubSeed = {
  name: "Beta Club",
  slug: "beta-club",
  description: "A second club with applications closed for the off season.",
  duesAmount: 3500,
  departments: ["Law", "Medicine", "Architecture", "Fine Arts"],
  committees: ["Socials", "Finance"],
  membershipOpen: false,
  members: [
    {
      name: "Ifeoma Beta",
      role: Role.PRESIDENT,
      status: MemberStatus.ACTIVE,
      email: "president@beta.test",
    },
    {
      name: "Dayo Beta",
      role: Role.EXEC,
      status: MemberStatus.ACTIVE,
      email: "exec@beta.test",
    },
    { name: "Ada Obi", role: Role.MEMBER, status: MemberStatus.ACTIVE }, // shared
    { name: "Halima Bakare", role: Role.MEMBER, status: MemberStatus.ACTIVE },
    { name: "Tobi Adeleke", role: Role.MEMBER, status: MemberStatus.ACTIVE },
    { name: "Uche Nnamdi", role: Role.MEMBER, status: MemberStatus.ACTIVE },
    { name: "Yemi Ojo", role: Role.MEMBER, status: MemberStatus.PENDING },
  ],
};

function emailFor(name: string): string {
  return name.toLowerCase().replace(/[^a-z]+/g, ".") + "@club.test";
}

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // Fresh, deterministic demo dataset: clear existing rows in FK-safe order.
  await prisma.attendance.deleteMany();
  await prisma.duesRecord.deleteMany();
  await prisma.event.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.club.deleteMany();

  // Platform admin: manages club lifecycle, holds no memberships.
  await prisma.user.create({
    data: {
      email: "admin@platform.test",
      name: "Platform Admin",
      passwordHash,
      isPlatformAdmin: true,
      emailVerified: new Date(), // seeded accounts skip the hard gate (SIGNUP.MD §1.3)
    },
  });

  /** Users are platform-level: the same person can hold memberships in many clubs. */
  async function getOrCreateUser(spec: MemberSeed) {
    const email = spec.email ?? emailFor(spec.name);
    return prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: spec.name,
        passwordHash,
        emailVerified: new Date(), // seeded accounts skip the hard gate (SIGNUP.MD §1.3)
      },
    });
  }

  async function seedClub(cfg: ClubSeed) {
    const club = await prisma.club.create({
      data: {
        name: cfg.name,
        slug: cfg.slug,
        status: ClubStatus.ACTIVE,
        description: cfg.description,
        approvedAt: new Date(),
        settings: {
          duesAmount: cfg.duesAmount,
          currency: "NGN",
          currentPeriod: PERIOD,
          departments: cfg.departments,
          committees: cfg.committees,
          membershipOpen: cfg.membershipOpen,
        },
      },
    });

    const memberships = [];
    for (let i = 0; i < cfg.members.length; i++) {
      const spec = cfg.members[i];
      const user = await getOrCreateUser(spec);
      memberships.push(
        await prisma.membership.create({
          data: {
            clubId: club.id,
            userId: user.id,
            role: spec.role,
            status: spec.status,
            department: cfg.departments[i % cfg.departments.length],
            level: LEVELS[i % LEVELS.length],
            committee:
              spec.status === MemberStatus.PENDING
                ? null
                : cfg.committees[i % cfg.committees.length],
            phone: `080-1000-${String(1000 + i).slice(-4)}`,
          },
        }),
      );
    }

    const exec = memberships.find((m) => m.role === Role.EXEC) ?? memberships[0];
    const president =
      memberships.find((m) => m.role === Role.PRESIDENT) ?? memberships[0];
    const active = memberships.filter((m) => m.status === MemberStatus.ACTIVE);
    const plainMembers = active.filter((m) => m.role === Role.MEMBER);

    // Dues: ~60% of ACTIVE members have paid for the current period.
    const paidCount = Math.round(active.length * 0.6);
    const methods = ["cash", "transfer", "other"];
    for (let i = 0; i < paidCount; i++) {
      await prisma.duesRecord.create({
        data: {
          clubId: club.id,
          membershipId: active[i].id,
          period: PERIOD,
          amount: cfg.duesAmount,
          method: methods[i % methods.length],
          recordedById: exec.id,
          note: i % 4 === 0 ? "Paid at general meeting" : null,
        },
      });
    }

    // Events: 2 upcoming + 1 past, with RSVPs and check-ins.
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const upcoming1 = await prisma.event.create({
      data: {
        clubId: club.id,
        title: "General Meeting",
        description: "Monthly general meeting for all members.",
        location: "Lecture Theatre A",
        startsAt: new Date(now + 7 * day),
        endsAt: new Date(now + 7 * day + 2 * 60 * 60 * 1000),
      },
    });
    const upcoming2 = await prisma.event.create({
      data: {
        clubId: club.id,
        title: "Career Workshop",
        description: "Resume reviews and mock interviews.",
        location: "ICT Hall",
        startsAt: new Date(now + 21 * day),
        endsAt: new Date(now + 21 * day + 3 * 60 * 60 * 1000),
      },
    });
    const past = await prisma.event.create({
      data: {
        clubId: club.id,
        title: "Welcome Mixer",
        description: "Start-of-session social for new and returning members.",
        location: "Student Center",
        startsAt: new Date(now - 14 * day),
        endsAt: new Date(now - 14 * day + 2 * 60 * 60 * 1000),
      },
    });

    const rsvpValues = [RsvpStatus.GOING, RsvpStatus.MAYBE, RsvpStatus.NOT_GOING];

    for (let i = 0; i < plainMembers.length; i++) {
      if (i % 3 === 0) continue; // some members haven't RSVP'd
      await prisma.attendance.create({
        data: {
          eventId: upcoming1.id,
          membershipId: plainMembers[i].id,
          rsvp: rsvpValues[i % rsvpValues.length],
        },
      });
    }
    await prisma.attendance.create({
      data: {
        eventId: upcoming2.id,
        membershipId: president.id,
        rsvp: RsvpStatus.GOING,
      },
    });

    // Past event: RSVPs plus check-ins for those who showed up.
    for (let i = 0; i < plainMembers.length; i++) {
      const rsvp = rsvpValues[i % rsvpValues.length];
      const checkedIn = rsvp === RsvpStatus.GOING;
      await prisma.attendance.create({
        data: {
          eventId: past.id,
          membershipId: plainMembers[i].id,
          rsvp,
          checkedInAt: checkedIn ? new Date(now - 14 * day + 10 * 60 * 1000) : null,
          checkedInById: checkedIn ? exec.id : null,
        },
      });
    }

    console.log(
      `  ${club.name} (/${club.slug}): ${memberships.length} memberships, ` +
        `${paidCount}/${active.length} paid, applications ${
          cfg.membershipOpen ? "open" : "closed"
        }`,
    );
    return club;
  }

  console.log("Seed complete:");
  await seedClub(DEMO_CLUB);
  await seedClub(BETA_CLUB);
  console.log(`  All accounts use the password: ${PASSWORD}`);
  console.log("  Platform admin:  admin@platform.test (no memberships)");
  console.log("  Demo Club:       president@club.test / exec@club.test");
  console.log("  Beta Club:       president@beta.test / exec@beta.test");
  console.log("  Both clubs:      ada.obi@club.test (exercises the switcher)");
  console.log("  Demo Club only:  chidi.okafor@club.test (exercises isolation)");
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
