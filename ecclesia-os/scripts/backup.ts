import "../src/server/env.js";
import { writeFile, mkdir } from "node:fs/promises";
import { Database } from "../src/server/db.js";
if (process.env.DATABASE_URL)
  throw new Error(
    "Para PostgreSQL externo use pg_dump; consulte docs/OPERACAO.md.",
  );
const db = new Database(".local/postgres");
try {
  await mkdir(".local/backups", { recursive: true });
  const file = `.local/backups/ecclesia-${Date.now()}.backup`;
  const blob = await db.dump();
  await writeFile(file, Buffer.from(await blob.arrayBuffer()), { mode: 0o600 });
  console.log(file);
} finally {
  await db.close();
}
