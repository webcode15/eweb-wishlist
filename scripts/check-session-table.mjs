import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL (see .env.example).");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
try {
  const n = await prisma.session.count();
  console.log("OK: Session table readable, count =", n);
} catch (e) {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
