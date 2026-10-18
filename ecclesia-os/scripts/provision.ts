import "../src/server/env.js";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { openDatabase } from "../src/server/db.js";
import { passwordHash } from "../src/server/security.js";
import { audit } from "../src/server/seed.js";
if (process.env.APP_MODE === "demo")
  throw new Error(
    "Use somente para provisionar ambiente de homologação vazio.",
  );
const file = process.argv[2];
if (!file)
  throw new Error(
    "Informe o caminho de um arquivo privado com o perfil de implantação.",
  );
const config = z
  .object({
    network: z.string().min(3),
    region: z.string().min(3),
    church: z.string().min(3),
    name: z.string().min(3),
    email: z.email(),
    password: z.string().min(14),
    totpSecret: z.string().regex(/^[A-Z2-7]{32}$/),
  })
  .parse(JSON.parse(await readFile(file, "utf8")));
const db = await openDatabase();
try {
  await db.transaction(async (q) => {
    if ((await q("SELECT 1 FROM users LIMIT 1")).length)
      throw new Error("Ambiente já provisionado.");
    const [network] = await q(
      "INSERT INTO networks(name) VALUES($1) RETURNING id",
      [config.network],
    );
    const [region] = await q(
      "INSERT INTO regions(network_id,name) VALUES($1,$2) RETURNING id",
      [network.id, config.region],
    );
    const [church] = await q(
      "INSERT INTO churches(network_id,region_id,name) VALUES($1,$2,$3) RETURNING id",
      [network.id, region.id, config.church],
    );
    const [user] = await q(
      "INSERT INTO users(name,email,password_hash,totp_secret) VALUES($1,$2,$3,$4) RETURNING id",
      [
        config.name,
        config.email.toLowerCase(),
        passwordHash(config.password),
        config.totpSecret,
      ],
    );
    await q(
      "INSERT INTO memberships(user_id,church_id,role) VALUES($1,$2,'admin')",
      [user.id, church.id],
    );
    await q("INSERT INTO network_members VALUES($1,$2)", [user.id, network.id]);
    await q("INSERT INTO campuses(church_id,name) VALUES($1,'Sede')", [
      church.id,
    ]);
    for (const [code, name, kind] of [
      ["bank", "Conta bancária", "asset"],
      ["giving", "Contribuições", "income"],
      ["fees", "Tarifas bancárias", "expense"],
      ["operations", "Despesas operacionais", "expense"],
    ])
      await q(
        "INSERT INTO accounts(church_id,code,name,kind) VALUES($1,$2,$3,$4)",
        [church.id, code, name, kind],
      );
    await q(
      "INSERT INTO funds(church_id,name) VALUES($1,'Dízimos e ofertas'),($1,'Missões')",
      [church.id],
    );
    await q(
      "INSERT INTO cost_centers(church_id,name) VALUES($1,'Administração')",
      [church.id],
    );
    await audit(q, user.id, church.id, "installation.provisioned");
  });
  console.log("Ambiente provisionado. Nenhuma credencial foi exibida.");
} finally {
  await db.close();
}
