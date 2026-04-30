import { PrismaClient } from "@prisma/client";
import path from "node:path";

const defaultSqliteUrl = `file:${path
  .join(process.cwd(), "prisma", "dev.sqlite")
  .replace(/\\/g, "/")}`;
const datasourceUrl = process.env.DATABASE_URL || defaultSqliteUrl;

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
