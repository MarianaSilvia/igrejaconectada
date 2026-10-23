import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { readFile, readdir, mkdir, writeFile, rename } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
// PostgreSQL DATE values are calendar dates, never JavaScript UTC instants.
pg.types.setTypeParser(1082, (value: string) => value);
function poolConfig(connectionString: string) {
  const ca = process.env.SUPABASE_CA_CERT || "-----BEGIN CERTIFICATE-----\nMIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL\nBQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l\ndyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh\nc2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow\nazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l\ndyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh\nc2UgUm9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW\nQyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q\nDmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2\nGtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi\ncvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4\nO4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt\nNaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX\nuXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt\naUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU\ntVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b\nVW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6\njB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx\nCea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2\nCMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P\no/bKiIz+Fq8=\n-----END CERTIFICATE-----";
  const parsed = new URL(connectionString);
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("sslrootcert");
  return {
    connectionString: parsed.toString(),
    ssl: { ca, rejectUnauthorized: true },
    // Vercel cria várias instâncias da função. Um pool grande em cada
    // instância esgota rapidamente o limite de conexões do Supabase.
    // Uma conexão por pool é suficiente porque cada operação já usa uma
    // transação curta e evita EMAXCONNSESSION em picos de acesso.
    max: 1,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 5000,
    allowExitOnIdle: true,
  };
}

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
      this.pool = new pg.Pool(poolConfig(url));
      if (serviceUrl)
        this.servicePool = new pg.Pool(poolConfig(serviceUrl));
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
  async verifyMigrationPrivileges() {
    if (!this.pool)
      throw new Error(
        "MIGRATION_DATABASE_URL deve apontar para um PostgreSQL externo; o modo demo não executa este preflight.",
      );
    const result = await this.pool.query(
      "SELECT current_user, has_schema_privilege(current_user,'public','USAGE') AS schema_usage, has_schema_privilege(current_user,'public','CREATE') AS schema_create, has_database_privilege(current_user,current_database(),'CONNECT') AS db_connect",
    );
    const role = result.rows[0];
    if (!role?.schema_usage || !role?.schema_create || !role?.db_connect)
      throw new Error(
        `O papel de migração ${role?.current_user ?? "desconhecido"} não possui USAGE, CREATE no schema public e CONNECT. Aplique DDL pelo canal administrativo do Supabase ou use um papel de migração dedicado com ownership controlado; nunca use ecclesia_app ou ecclesia_service.`,
      );
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
  const url = process.env.ECCLESIA_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    if (process.env.APP_MODE === "production")
      throw new Error("DATABASE_URL required");
    await mkdir(".local", { recursive: true });
  }
  return new Database(
    url ? undefined : ".local/postgres",
    url,
    process.env.ECCLESIA_SERVICE_DATABASE_URL ?? process.env.SERVICE_DATABASE_URL,
  );
}
