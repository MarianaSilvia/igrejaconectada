import type { Database, Query } from "./db.js";
import { passwordHash } from "./security.js";
export const IDS = {
  network: "10000000-0000-4000-8000-000000000001",
  region: "10000000-0000-4000-8000-000000000002",
  churchA: "20000000-0000-4000-8000-000000000001",
  churchB: "20000000-0000-4000-8000-000000000002",
  admin: "30000000-0000-4000-8000-000000000001",
  central: "30000000-0000-4000-8000-000000000002",
  member: "30000000-0000-4000-8000-000000000003",
  adminB: "30000000-0000-4000-8000-000000000004",
};
export const DEMO_SECRET = "JBSWY3DPEHPK3PXP";
export async function audit(
  q: Query,
  actor: string | null,
  church: string | null,
  action: string,
  id?: string,
) {
  await q(
    "INSERT INTO audit_events(actor_id,church_id,action,resource_id) VALUES($1,$2,$3,$4)",
    [actor, church, action, id ?? null],
  );
}
export async function seed(db: Database) {
  await db.transaction(async (q) => {
    if ((await q("SELECT 1 FROM users LIMIT 1")).length) return;
    await q("INSERT INTO networks(id,name) VALUES($1,$2)", [
      IDS.network,
      "Convenção Caminho de Esperança",
    ]);
    await q("INSERT INTO regions(id,network_id,name) VALUES($1,$2,$3)", [
      IDS.region,
      IDS.network,
      "Regional Sudeste",
    ]);
    for (const [id, name] of [
      [IDS.churchA, "Comunidade Esperança"],
      [IDS.churchB, "Igreja Caminho Vivo"],
    ]) {
      await q(
        "INSERT INTO churches(id,network_id,region_id,name) VALUES($1,$2,$3,$4)",
        [id, IDS.network, IDS.region, name],
      );
      await q("INSERT INTO campuses(church_id,name) VALUES($1,$2)", [
        id,
        "Sede",
      ]);
    }
    const pwd = passwordHash("Demo@Ecclesia2026");
    for (const [id, email, name] of [
      [IDS.admin, "admin@esperanca.demo", "Mariana Costa"],
      [IDS.central, "central@rede.demo", "Gabriel Almeida"],
      [IDS.member, "membro@esperanca.demo", "Ana Martins"],
      [IDS.adminB, "admin@caminho.demo", "Pedro Nunes"],
    ])
      await q(
        "INSERT INTO users(id,email,name,password_hash,totp_secret) VALUES($1,$2,$3,$4,$5)",
        [id, email, name, pwd, id === IDS.member ? null : DEMO_SECRET],
      );
    await q(
      "INSERT INTO memberships(user_id,church_id,role) VALUES($1,$2,'admin'),($3,$4,'admin'),($5,$2,'member')",
      [IDS.admin, IDS.churchA, IDS.adminB, IDS.churchB, IDS.member],
    );
    await q("INSERT INTO network_members VALUES($1,$2)", [
      IDS.central,
      IDS.network,
    ]);
    const names = [
      "Ana Martins",
      "Lucas Oliveira",
      "Beatriz Santos",
      "Rafael Lima",
      "Sofia Almeida",
      "Miguel Pereira",
      "Helena Rocha",
      "Daniel Souza",
      "Laura Costa",
      "Gabriel Ribeiro",
      "Manuela Alves",
      "Samuel Gomes",
      "Cecília Dias",
      "Davi Ferreira",
      "Isabela Melo",
      "Arthur Silva",
      "Clara Barros",
      "João Teixeira",
    ];
    for (const church of [IDS.churchA, IDS.churchB]) {
      const households = await q(
        "INSERT INTO households(church_id,name) VALUES($1,'Família Martins'),($1,'Família Oliveira') RETURNING id",
        [church],
      );
      for (let i = 0; i < (church === IDS.churchA ? 18 : 9); i++)
        await q(
          "INSERT INTO people(church_id,name,email,status,household_id,user_id) VALUES($1,$2,$3,$4,$5,$6)",
          [
            church,
            names[i],
            `${church === IDS.churchA ? "a" : "b"}${i}@example.invalid`,
            i % 5 === 0 ? "visitor" : "member",
            households[i % 2].id,
            i === 0 && church === IDS.churchA ? IDS.member : null,
          ],
        );
      const people = await q(
        "SELECT id FROM people WHERE church_id=$1 ORDER BY name",
        [church],
      );
      const cellNames =
        church === IDS.churchA
          ? ["Raízes · Centro", "Casa de Paz · Jardim", "Nova Vida · Vila Nova"]
          : ["Caminho · Sede", "Sementes · Zona Sul"];
      for (let i = 0; i < cellNames.length; i++) {
        const [cell] = await q(
          "INSERT INTO cells(church_id,name,leader_name) VALUES($1,$2,$3) RETURNING id",
          [church, cellNames[i], names[i + 3]],
        );
        for (const p of people.slice(i * 4, i * 4 + 4))
          await q("INSERT INTO cell_members VALUES($1,$2,$3)", [
            church,
            cell.id,
            p.id,
          ]);
        for (let week = 3; week >= 1; week--) {
          const [m] = await q(
            "INSERT INTO meetings(church_id,cell_id,held_on,visitors) VALUES($1,$2,CURRENT_DATE-($3::int*7),1) RETURNING id",
            [church, cell.id, week],
          );
          for (const [j, p] of people.slice(i * 4, i * 4 + 4).entries())
            await q("INSERT INTO attendance VALUES($1,$2,$3,$4)", [
              church,
              m.id,
              p.id,
              j !== 0,
            ]);
        }
      }
      for (let i = 0; i < 4; i++)
        await q(
          "INSERT INTO workflow_cards(church_id,person_id,stage) VALUES($1,$2,$3)",
          [church, people[i].id, i],
        );
      for (const [code, name, kind] of [
        ["bank", "Conta bancária", "asset"],
        ["giving", "Contribuições", "income"],
        ["operations", "Despesas operacionais", "expense"],
        ["fees", "Tarifas bancárias", "expense"],
      ])
        await q(
          "INSERT INTO accounts(church_id,code,name,kind) VALUES($1,$2,$3,$4)",
          [church, code, name, kind],
        );
      await q(
        "INSERT INTO funds(church_id,name) VALUES($1,'Dízimos e ofertas'),($1,'Missões'),($1,'Construção')",
        [church],
      );
      await q(
        "INSERT INTO cost_centers(church_id,name) VALUES($1,'Administração'),($1,'Ministérios')",
        [church],
      );
      const accounts = await q(
        "SELECT id,code FROM accounts WHERE church_id=$1",
        [church],
      );
      for (let month = 5; month >= 0; month--) {
        const amount =
          (church === IDS.churchA ? 125000 : 78000) + (5 - month) * 12300;
        const [e] = await q(
          "INSERT INTO journal_entries(church_id,description,occurred_on) VALUES($1,'Contribuições fictícias — demonstração',(date_trunc('month',CURRENT_DATE)-($2::int*interval '1 month'))::date) RETURNING id",
          [church, month],
        );
        await q(
          "INSERT INTO journal_lines(church_id,entry_id,account_id,amount_cents) VALUES($1,$2,$3,$5),($1,$2,$4,-$5)",
          [
            church,
            e.id,
            accounts.find((a) => a.code === "bank")!.id,
            accounts.find((a) => a.code === "giving")!.id,
            amount,
          ],
        );
      }
    }
    await q(
      "INSERT INTO schedules(church_id,user_id,ministry,starts_at,ends_at) VALUES($1,$2,'Recepção · Culto de domingo',now()+interval '3 days',now()+interval '3 days 2 hours')",
      [IDS.churchA, IDS.member],
    );
  });
}
