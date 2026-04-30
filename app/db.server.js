import { PrismaClient } from "@prisma/client";
import path from "node:path";

const defaultLocalDbUrl = `file:${path
  .join(process.cwd(), "prisma", "dev.sqlite")
  .replace(/\\/g, "/")}`;
const datasourceUrl =
  process.env.DATABASE_URL ||
  (process.env.NODE_ENV !== "production" ? defaultLocalDbUrl : null);

if (!datasourceUrl) {
  throw new Error("DATABASE_URL is not set in production environment.");
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient({
      datasources: { db: { url: datasourceUrl } },
    });
  }
}

const prisma =
  global.prismaGlobal ??
  new PrismaClient({
    datasources: { db: { url: datasourceUrl } },
  });

export default prisma;
