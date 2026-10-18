import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { readFile, readdir, mkdir, writeFile, rename } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
// PostgreSQL DATE values are calendar dates, never JavaScript UTC instants.
pg.types.setTypeParser(1082, (value: string) => value);
export type Row = Record<string, any>;
export interface Query {
  (sql: string, params?: any[]): Promise<Row[]>;
}
export class Database {
  private local?: PGlite;
  private pool?: pg.Pool;
  private servicePool?: pg.Pool;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    public directory: string | undefined,
    url?: string,
    serviceUrl?: string,
  ) {
    if (url) {
      this.pool = new pg.Pool({ connectionString: url });
      if (serviceUrl)
        this.servicePool = new pg.Pool({ connectionString: serviceUrl });
    } else {
      const snapshot = directory ? `${directory}.snapshot` : undefined;
      this.local = new PGlite({
        ...(snapshot && existsSync(snapshot)
          ? { loadDataDir: new Blob([readFileSync(snapshot)]) }
          : {}),
        parsers: { 1082: (value: string) => value },
      });
    }
  }
  private async persist() {
    if (!this.local || !this.directory) return;
    const file = `${this.directory}.snapshot`;
    await mkdir(path.dirname(file), { recursive: true });
    const snapshot = await this.local.dumpDataDir("gzip");
    await writeFile(`${file}.tmp`, Buffer.from(await snapshot.arrayBuffer()), {
      mode: 0o600,
    });
    await rename(`${file}.tmp`, file);
  }
  async transaction<T>(
    fn: (q: Query) => Promise<T>,
    context?: { actor: string; church: string },
  ): Promise<T> {
    const execute = async () => {
      const client = this.pool
        ? await (
            !context && this.servicePool ? this.servicePool : this.pool
          ).connect()
        : this.local!;
      let changed = false;
      const q: Query = async (sql, params = []) => {
        if (
          /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql)
        )
          changed = true;
        return this.pool
          ? (await (client as pg.PoolClient).query(sql, params)).rows
          : (await (client as PGlite).query<Row>(sql, params)).rows;
      };
      let committed = false;
      try {
        await q("BEGIN");
        await q("SET LOCAL TIME ZONE 'America/Sao_Paulo'");
        if (context) {
          await q("SET LOCAL ROLE ecclesia_app");
          await q(
            "SELECT set_config('app.actor',$1,true),set_config('app.church',$2,true)",
            [context.actor, context.church],
          );
        } else await q("SET LOCAL ROLE ecclesia_service");
        const result = await fn(q);
        await q("COMMIT");
        committed = true;
        if (changed) await this.persist();
        return result;
      } catch (e) {
        if (!committed) await q("ROLLBACK");
        throw e;
      } finally {
        if (this.pool) (client as pg.PoolClient).release();
      }
    };
    if (this.pool) return execute();
    const run = this.queue.then(execute, execute);
    this.queue = run.catch(() => {});
    return run;
  }
  async migrate() {
    const client = this.pool ? await this.pool.connect() : this.local!;
    const q: Query = async (sql, params = []) =>
      this.pool
        ? (await (client as pg.PoolClient).query(sql, params)).rows
        : (await (client as PGlite).query<Row>(sql, params)).rows;
    try {
      await q("BEGIN");
      await q("SELECT pg_advisory_xact_lock(48611307)");
      await q(
        "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
      );
      for (const name of (await readdir("migrations"))
        .filter((n) => n.endsWith(".sql"))
        .sort()) {
        if (
          (await q("SELECT 1 FROM schema_migrations WHERE name=$1", [name]))
            .length
        )
          continue;
        const sql = await readFile(path.join("migrations", name), "utf8");
        if (this.local) await this.local.exec(sql);
        else await (client as pg.PoolClient).query(sql);
        await q("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
      }
      await q("COMMIT");
      await this.persist();
    } catch (e) {
      await q("ROLLBACK");
      throw e;
    } finally {
      if (this.pool) (client as pg.PoolClient).release();
    }
  }
  async verifyRuntimeSeparation() {
    if (!this.pool || !this.servicePool)
      throw new Error(
        "Credenciais de aplicação e serviço separadas são obrigatórias.",
      );
    const app = await this.pool.query(
      "SELECT r.rolsuper,r.rolbypassrls,r.rolcreaterole,pg_has_role(current_user,'ecclesia_service','MEMBER') AS service_member,pg_has_role(current_user,'ecclesia_app','MEMBER') AS app_member FROM pg_roles r WHERE r.rolname=current_user",
    );
    const role = app.rows[0];
    if (
      !role ||
      role.rolsuper ||
      role.rolbypassrls ||
      role.rolcreaterole ||
      role.service_member ||
      !role.app_member
    )
      throw new Error(
        "DATABASE_URL deve usar login restrito a ecclesia_app, sem privilégios de serviço.",
      );
    const service = await this.servicePool.query(
      "SELECT pg_has_role(current_user,'ecclesia_service','MEMBER') AS allowed",
    );
    if (!service.rows[0]?.allowed)
      throw new Error(
        "SERVICE_DATABASE_URL deve permitir somente o papel de serviço necessário.",
      );
  }
  async close() {
    if (this.local) await this.local.close();
    if (this.pool) await this.pool.end();
    if (this.servicePool) await this.servicePool.end();
  }
  async dump() {
    if (!this.local) throw new Error("Use pg_dump for external PostgreSQL");
    await this.queue;
    return this.local.dumpDataDir("gzip");
  }
}
export async function openDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (process.env.APP_MODE === "production")
      throw new Error("DATABASE_URL required");
    await mkdir(".local", { recursive: true });
  }
  return new Database(
    url ? undefined : ".local/postgres",
    url,
    process.env.SERVICE_DATABASE_URL,
  );
}
