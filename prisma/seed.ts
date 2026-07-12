import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
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
const DUES_AMOUNT = 2000;
const DEPARTMENTS = [
  "Computer Science",
  "Electrical Engineering",
  "Mechanical Engineering",
  "Economics",
];
const COMMITTEES = ["Welfare", "Publicity", "Events"];
const LEVELS = ["100", "200", "300", "400", "500"];

const MEMBER_NAMES = [
  "Ada Obi",
  "Chidi Okafor",
  "Bola Adeyemi",
  "Emeka Nwosu",
  "Fatima Bello",
  "Grace Eze",
  "Ibrahim Sani",
  "Ngozi Uche",
  "Segun Balogun",
  "Zainab Yusuf",
];
const PENDING_NAMES = ["Tunde Alabi", "Rita Okon"];

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

  // 1. Club --------------------------------------------------------------
  const club = await prisma.club.create({
    data: {
      name: "Demo Club",
      settings: {
        duesAmount: DUES_AMOUNT,
        currency: "NGN",
        currentPeriod: PERIOD,
        departments: DEPARTMENTS,
        committees: COMMITTEES,
      },
    },
  });

  // Helper to create a User + Membership pair.
  async function createMember(opts: {
    name: string;
    role: Role;
    status: MemberStatus;
    department?: string;
    level?: string;
    committee?: string;
    phone?: string;
  }) {
    const user = await prisma.user.create({
      data: {
        email: emailFor(opts.name),
        name: opts.name,
        passwordHash,
      },
    });
    return prisma.membership.create({
      data: {
        clubId: club.id,
        userId: user.id,
        role: opts.role,
        status: opts.status,
        department: opts.department ?? null,
        level: opts.level ?? null,
        committee: opts.committee ?? null,
        phone: opts.phone ?? null,
      },
    });
  }

  // 2. President ---------------------------------------------------------
  const presidentUser = await prisma.user.create({
    data: {
      email: "president@club.test",
      name: "Amara President",
      passwordHash,
    },
  });
  const president = await prisma.membership.create({
    data: {
      clubId: club.id,
      userId: presidentUser.id,
      role: Role.PRESIDENT,
      status: MemberStatus.ACTIVE,
      department: DEPARTMENTS[0],
      level: "500",
      committee: COMMITTEES[0],
      phone: "080-0000-0001",
    },
  });

  // 3. Exec + 10 members (ACTIVE) + 2 PENDING ---------------------------
  const exec = await createMember({
    name: "Kunle Exec",
    role: Role.EXEC,
    status: MemberStatus.ACTIVE,
    department: DEPARTMENTS[1],
    level: "400",
    committee: COMMITTEES[1],
    phone: "080-0000-0002",
  });

  const members = [] as Awaited<ReturnType<typeof createMember>>[];
  for (let i = 0; i < MEMBER_NAMES.length; i++) {
    const m = await createMember({
      name: MEMBER_NAMES[i],
      role: Role.MEMBER,
      status: MemberStatus.ACTIVE,
      department: DEPARTMENTS[i % DEPARTMENTS.length],
      level: LEVELS[i % LEVELS.length],
      committee: COMMITTEES[i % COMMITTEES.length],
      phone: `080-1000-${String(1000 + i).slice(-4)}`,
    });
    members.push(m);
  }

  for (let i = 0; i < PENDING_NAMES.length; i++) {
    await createMember({
      name: PENDING_NAMES[i],
      role: Role.MEMBER,
      status: MemberStatus.PENDING,
      department: DEPARTMENTS[i % DEPARTMENTS.length],
      level: LEVELS[i % LEVELS.length],
    });
  }

  // 4. Dues: ~60% of ACTIVE members paid for the current period ----------
  const activeMemberships = [president, exec, ...members];
  const paidCount = Math.round(activeMemberships.length * 0.6);
  const methods = ["cash", "transfer", "other"];
  for (let i = 0; i < paidCount; i++) {
    const m = activeMemberships[i];
    await prisma.duesRecord.create({
      data: {
        clubId: club.id,
        membershipId: m.id,
        period: PERIOD,
        amount: DUES_AMOUNT,
        method: methods[i % methods.length],
        recordedById: exec.id,
        note: i % 4 === 0 ? "Paid at general meeting" : null,
      },
    });
  }

  // 5. Events: 2 upcoming + 1 past, with RSVPs and check-ins -------------
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

  // Upcoming event RSVPs (no check-ins yet).
  for (let i = 0; i < members.length; i++) {
    if (i % 3 === 0) continue; // some members haven't RSVP'd
    await prisma.attendance.create({
      data: {
        eventId: upcoming1.id,
        membershipId: members[i].id,
        rsvp: rsvpValues[i % rsvpValues.length],
      },
    });
  }
  await prisma.attendance.create({
    data: { eventId: upcoming2.id, membershipId: president.id, rsvp: RsvpStatus.GOING },
  });

  // Past event: RSVPs plus check-ins for those who showed up.
  for (let i = 0; i < members.length; i++) {
    const rsvp = rsvpValues[i % rsvpValues.length];
    const checkedIn = rsvp === RsvpStatus.GOING;
    await prisma.attendance.create({
      data: {
        eventId: past.id,
        membershipId: members[i].id,
        rsvp,
        checkedInAt: checkedIn ? new Date(now - 14 * day + 10 * 60 * 1000) : null,
        checkedInById: checkedIn ? exec.id : null,
      },
    });
  }

  console.log("Seed complete:");
  console.log(`  Club: ${club.name}`);
  console.log(`  Accounts: 1 president, 1 exec, ${members.length} members, ${PENDING_NAMES.length} pending`);
  console.log(`  Dues paid: ${paidCount}/${activeMemberships.length} active for ${PERIOD}`);
  console.log(`  Events: 2 upcoming, 1 past`);
  console.log(`  Login with president@club.test / ${PASSWORD}`);
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
