import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 requires a driver adapter at runtime. @prisma/adapter-pg works with
// any PostgreSQL host (Neon, Supabase, local) over a standard connection string.
//
// The app always reads DATABASE_URL. On Supabase that is the *pooled* URL; the
// direct connection is DIRECT_URL and belongs to the Prisma CLI alone, so that
// migrations get a real session. See `prisma.config.ts`.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
