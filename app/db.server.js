import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Vite SSR dev often runs with a cwd that is NOT the repo root. `process.cwd()` then
 * points `file:.../prisma/dev.sqlite` at a non-existent path → SQLite error 14 and a
 * misleading "session table does not exist" from PrismaSessionStorage.
 */
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

const appRoot = getAppRoot();

const defaultSqliteUrl = `file:${path
  .join(appRoot, "prisma", "dev.sqlite")
  .replace(/\\/g, "/")}`;

function normalizeFileDatabaseUrl(url) {
  if (!url.startsWith("file:")) return url;
  let p = url.slice("file:".length);
  if (p.startsWith("/") && /^\/[a-zA-Z]:/.test(p)) {
    p = p.slice(1);
  }
  const resolved = path.isAbsolute(p) ? p : path.join(appRoot, p);
  return `file:${resolved.replace(/\\/g, "/")}`;
}

function resolveDatabaseUrl() {
  const explicit = process.env.DATABASE_URL?.trim();
  const usePostgresLocal = process.env.USE_LOCAL_POSTGRES === "1";

  if (process.env.NODE_ENV === "production") {
    if (explicit) {
      return explicit.startsWith("file:") ? normalizeFileDatabaseUrl(explicit) : explicit;
    }
    return defaultSqliteUrl;
  }

  if (explicit && (usePostgresLocal || explicit.startsWith("file:"))) {
    return explicit.startsWith("file:") ? normalizeFileDatabaseUrl(explicit) : explicit;
  }

  return defaultSqliteUrl;
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
