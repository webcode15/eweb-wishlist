/**
 * Prisma requires DATABASE_URL in the environment to parse schema.prisma.
 * app/db.server.js falls back for the running app in dev, but the CLI does not.
 * Local dev uses SQLite (file:./prisma/dev.db). Production requires a real DATABASE_URL.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultLocal = "file:./prisma/dev.db";

if (!process.env.DATABASE_URL?.trim()) {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "DATABASE_URL is required. Add it to your environment (e.g. .env or hosting dashboard).",
    );
    process.exit(1);
  }
  process.env.DATABASE_URL = defaultLocal;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/prisma-with-local-default.mjs <prisma-args...>");
  process.exit(1);
}

const result = spawnSync("npx", ["prisma@6.19.3", ...args], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: true,
});

process.exit(result.status === null ? 1 : result.status);
