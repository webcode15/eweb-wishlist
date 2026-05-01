import { PrismaClient } from "@prisma/client";
import path from "node:path";

/** Same file as `url = "file:dev.sqlite"` in prisma/schema.prisma (relative to prisma/). */
const defaultSqliteUrl = `file:${path
  .join(process.cwd(), "prisma", "dev.sqlite")
  .replace(/\\/g, "/")}`;

function resolveDatabaseUrl() {
  const explicit = process.env.DATABASE_URL?.trim();
  const usePostgresLocal = process.env.USE_LOCAL_POSTGRES === "1";

  if (process.env.NODE_ENV === "production") {
    return explicit || defaultSqliteUrl;
  }

  // Local `shopify app dev`: ignore a leftover Postgres URL in .env unless opted in.
  if (explicit && (usePostgresLocal || explicit.startsWith("file:"))) {
    return explicit;
  }

  return defaultSqliteUrl;
}

const datasourceUrl = resolveDatabaseUrl();

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
