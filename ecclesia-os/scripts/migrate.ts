import "../src/server/env.js";
import { Database } from "../src/server/db.js";
if (process.env.MIGRATION_DATABASE_URL) {
  const db = new Database(undefined, process.env.MIGRATION_DATABASE_URL);
  await db.migrate();
  await db.close();
  console.log("Migrações aplicadas.");
} else
  throw new Error("Defina MIGRATION_DATABASE_URL; demo migra automaticamente.");
