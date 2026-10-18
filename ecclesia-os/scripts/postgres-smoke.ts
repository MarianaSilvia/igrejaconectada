import "../src/server/env.js";
import { openDatabase } from "../src/server/db.js";

if ((process.env.APP_MODE ?? "demo") !== "homologation") {
  console.error(
    JSON.stringify({
      ok: false,
      reason: "invalid_mode",
      message: "O smoke test PostgreSQL externo exige APP_MODE=homologation.",
    }),
  );
  process.exitCode = 2;
  process.exit();
}

const requiredUrls = [
  "DATABASE_URL",
  "SERVICE_DATABASE_URL",
  "MIGRATION_DATABASE_URL",
];
const missingUrls = requiredUrls.filter((name) => !process.env[name]);
if (missingUrls.length) {
  console.error(
    JSON.stringify({
      ok: false,
      reason: "missing_database_urls",
      missing: missingUrls,
      message: `Configure ${missingUrls.join(", ")} antes de executar o smoke test.`,
    }),
  );
  process.exitCode = 2;
  process.exit();
}
const configuredUrls = requiredUrls.map((name) => process.env[name]!);
if (new Set(configuredUrls).size !== configuredUrls.length) {
  console.error(
    JSON.stringify({
      ok: false,
      reason: "duplicate_database_urls",
      message:
        "DATABASE_URL, SERVICE_DATABASE_URL e MIGRATION_DATABASE_URL devem usar URLs distintas.",
    }),
  );
  process.exitCode = 2;
  process.exit();
}

const db = await openDatabase();
try {
  await db.verifyRuntimeSeparation();
  const { churches, actor } = await db.transaction(async (q) => {
    const churches = await q("SELECT id FROM churches ORDER BY id LIMIT 2");
    const [actor] = await q(
      "SELECT m.user_id AS id,m.church_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.role='admin' AND u.disabled_at IS NULL ORDER BY m.user_id LIMIT 1",
    );
    return { churches, actor };
  });
  if (churches.length < 2 || !actor)
    throw new Error(
      "O smoke test exige duas igrejas e um administrador ativo.",
    );
  const [first, second] = churches;
  if (actor.church_id !== first.id)
    throw new Error(
      "O primeiro administrador encontrado não pertence à primeira igreja selecionada.",
    );
  const result = await db.transaction(
    async (q) => {
      const [visible] = await q(
        "SELECT count(*)::int AS total FROM people WHERE church_id=$1",
        [first.id],
      );
      const [hidden] = await q(
        "SELECT count(*)::int AS total FROM people WHERE church_id=$1",
        [second.id],
      );
      const sensitive = {} as Record<string, number>;
      for (const table of [
        "documents",
        "privacy_requests",
        "communication_messages",
      ]) {
        const [row] = await q(
          `SELECT count(*)::int AS total FROM ${table} WHERE church_id=$1`,
          [second.id],
        );
        sensitive[table] = Number(row.total);
      }
      const [role] = await q("SELECT current_user AS role");
      return {
        visible: Number(visible.total),
        hidden: Number(hidden.total),
        sensitive,
        role: role.role,
      };
    },
    { actor: actor.id, church: first.id },
  );
  if (result.hidden !== 0)
    throw new Error(
      `RLS falhou: a primeira igreja retornou ${result.hidden} pessoas da segunda.`,
    );
  const leaked = Object.entries(result.sensitive).filter(
    ([, total]) => total !== 0,
  );
  if (leaked.length)
    throw new Error(
      `RLS falhou em tabelas sensíveis: ${leaked.map(([table, total]) => `${table}=${total}`).join(", ")}.`,
    );
  let writeBlocked = false;
  const rollbackProbe = new Error("RLS probe rollback");
  try {
    await db.transaction(
      async (q) => {
        await q(
          "INSERT INTO people(church_id,name,status) VALUES($1,'RLS probe','member')",
          [second.id],
        );
        throw rollbackProbe;
      },
      { actor: actor.id, church: first.id },
    );
  } catch (error) {
    writeBlocked = error !== rollbackProbe;
  }
  if (!writeBlocked)
    throw new Error(
      "RLS falhou: a primeira igreja conseguiu gravar na segunda.",
    );
  console.log(
    JSON.stringify({
      ok: true,
      appRole: result.role,
      church: first.id,
      isolatedChurch: second.id,
      visiblePeople: result.visible,
      hiddenPeople: result.hidden,
      hiddenSensitive: result.sensitive,
      crossChurchWriteBlocked: writeBlocked,
    }),
  );
} finally {
  await db.close();
}
