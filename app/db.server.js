import { PrismaClient } from "@prisma/client";

const defaultLocalSqliteUrl = "file:./prisma/dev.db";

function resolveDatabaseUrl() {
  const explicit = process.env.DATABASE_URL?.trim();
  if (explicit) {
    return explicit;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is required in production (e.g. Neon or Render Postgres connection string).",
    );
  }
  return defaultLocalSqliteUrl;
}

const datasourceUrl = resolveDatabaseUrl();

if (process.env.NODE_ENV !== "production") {
  if (
    !global.prismaGlobal ||
    global.__ewebworldPrismaUrl !== datasourceUrl
  ) {
    if (global.prismaGlobal) {
      global.prismaGlobal.$disconnect().catch(() => {});
    }
    global.prismaGlobal = new PrismaClient({
      datasources: { db: { url: datasourceUrl } },
    });
    global.__ewebworldPrismaUrl = datasourceUrl;
  }
}

const prisma =
  global.prismaGlobal ??
  new PrismaClient({
    datasources: { db: { url: datasourceUrl } },
  });

export default prisma;
