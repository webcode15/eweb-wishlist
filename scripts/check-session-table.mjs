import { PrismaClient } from "@prisma/client";

const defaultUrl =
  "postgresql://postgres:postgres@127.0.0.1:5432/ewebworld?schema=public";
const url = process.env.DATABASE_URL?.trim() || defaultUrl;

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
