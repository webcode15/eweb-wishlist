import { PrismaClient } from "@prisma/client";
import path from "node:path";

const url =
  "file:" + path.join(process.cwd(), "prisma", "dev.sqlite").replace(/\\/g, "/");
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
