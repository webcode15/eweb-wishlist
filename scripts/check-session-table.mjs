import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function getAppRoot() {
  const fromModule = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  if (existsSync(path.join(fromModule, "prisma", "schema.prisma"))) {
    return fromModule;
  }
  return process.cwd();
}

const defaultUrl = `file:${path
  .join(getAppRoot(), "prisma", "dev.sqlite")
  .replace(/\\/g, "/")}`;
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
