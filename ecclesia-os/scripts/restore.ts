import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
const [source, target] = process.argv.slice(2);
if (!source || !target)
  throw new Error("Uso: npm run restore -- arquivo.backup .local/restore-test");
const resolved = path.resolve(target),
  root = path.resolve(".local") + path.sep;
if (
  !resolved.startsWith(root) ||
  existsSync(resolved) ||
  existsSync(`${resolved}.snapshot`)
)
  throw new Error("Destino precisa ser novo e estar dentro de .local.");
await mkdir(path.dirname(resolved), { recursive: true });
const data = await readFile(source);
const db = await PGlite.create({ loadDataDir: new Blob([data]) });
try {
  const result = await db.query("SELECT count(*)::int AS total FROM churches");
  console.log("Restauração verificada:", result.rows);
  await writeFile(`${resolved}.snapshot`, data, { mode: 0o600 });
} finally {
  await db.close();
}
