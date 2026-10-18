import "../src/server/env.js";
import { Database } from "../src/server/db.js";
import { Efi } from "../src/server/efi.js";
import { startIntegrationWorker } from "../src/server/integration-jobs.js";
if (!process.env.SERVICE_DATABASE_URL)
  throw new Error("Configure SERVICE_DATABASE_URL para o worker isolado.");
const db = new Database(undefined, process.env.SERVICE_DATABASE_URL);
const efi = await Efi.load();
const stop = startIntegrationWorker(db, efi);
// An isolated worker must keep its event loop alive between durable jobs.
const keepAlive = setInterval(() => {}, 60000);
let closing = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    clearInterval(keepAlive);
    await stop();
    await db.close();
  });
