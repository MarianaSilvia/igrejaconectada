import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { Database } from "../src/server/db.ts";
import { seed, IDS } from "../src/server/seed.ts";
import { createApp } from "../src/server/app.ts";
import { Efi } from "../src/server/efi.ts";
import { totp } from "../src/server/security.ts";
const require = createRequire(import.meta.url);
let chromium;
try {
  chromium = process.env.PLAYWRIGHT_MODULE
    ? require(process.env.PLAYWRIGHT_MODULE).chromium
    : (await import("playwright")).chromium;
} catch {
  console.error(JSON.stringify({ ok: false, reason: "missing_playwright", message: "Instale Playwright ou configure PLAYWRIGHT_MODULE antes do smoke test visual." }));
  process.exit(2);
}
const db = new Database(undefined);
await db.migrate();
await seed(db);
const options = {
  mode: "demo",
  key: Buffer.alloc(32, 6),
  efi: new Efi([]),
  origin: "",
};
const app = createApp(db, options);
app.use(express.static(path.resolve("dist")));
app.get("/{*path}", (_r, s) => s.sendFile(path.resolve("dist/index.html")));
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
options.origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: "msedge" }) });
const admin = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  }),
  errors = [];
admin.on("pageerror", (e) => errors.push(e.message));
const publicCatalog = await browser.newPage({ viewport: { width: 1440, height: 900 } });
publicCatalog.on("pageerror", (e) => errors.push(`catalog: ${e.message}`));
const navigate = async (name) => {
  await admin
    .getByRole("navigation", { name: "Menu principal" })
    .getByRole("button", { name, exact: true })
    .click();
  await admin.getByRole("heading", { name, level: 1, exact: true }).waitFor();
};
try {
  await publicCatalog.goto(`${options.origin}/catalogo/${IDS.churchA}`);
  await publicCatalog.getByRole("heading", { name: "Comunidade Esperança", level: 1 }).waitFor();
  await publicCatalog.getByText("CATÁLOGO DA COMUNIDADE", { exact: true }).waitFor();
  await publicCatalog.setViewportSize({ width: 390, height: 844 });
  if (await publicCatalog.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw new Error("Mobile overflow: catálogo público");
  await admin.goto(options.origin);
  await admin
    .getByRole("button", { name: "Administração local admin@esperanca.demo" })
    .click();
  await admin.getByRole("button", { name: "Entrar na comunidade" }).click();
  await admin.getByRole("button", { name: "Confirmar e entrar" }).click();
  await admin
    .getByRole("heading", { name: "Olá, Mariana. Vamos cuidar?" })
    .waitFor();
  await navigate("Secretaria e operação");
  await admin
    .getByRole("button", { name: "Acessos e convites", exact: true })
    .click();
  await admin.getByLabel("Nome", { exact: true }).fill("Membro Convidado");
  await admin
    .getByLabel("E-mail", { exact: true })
    .fill("convidado@example.invalid");
  await admin.getByLabel("Função", { exact: true }).selectOption("member");
  await admin
    .getByRole("button", { name: "Gerar convite privado", exact: true })
    .click();
  const invite = admin.getByLabel(
    "Endereço privado · entregue somente à pessoa identificada",
  );
  await invite.waitFor();
  const inviteUrl = await invite.inputValue();
  const guestContext = await browser.newContext(),
    guest = await guestContext.newPage();
  guest.on("pageerror", (e) => errors.push(e.message));
  await guest.goto(new URL(inviteUrl, options.origin).href);
  await guest
    .getByLabel("Nova senha · mínimo de 14 caracteres")
    .fill("SenhaDeTeste@2026longa");
  const secret = (await guest.locator("code").textContent()).trim();
  await guest
    .getByLabel("Código do autenticador", { exact: true })
    .fill(totp(secret));
  await guest
    .getByRole("button", { name: "Aceitar convite", exact: true })
    .click();
  await guest.getByRole("heading", { name: "Acesso atualizado" }).waitFor();
  const [joined] = await db.transaction((q) =>
    q(
      "SELECT m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.email='convidado@example.invalid' AND m.church_id=$1",
      [IDS.churchA],
    ),
  );
  if (joined?.role !== "member")
    throw new Error("Invitation UI did not create the expected membership");
  await navigate("Contas e aprovações");
  await admin
    .getByRole("button", { name: "Nova solicitação", exact: true })
    .click();
  await admin
    .getByLabel("Descrição", { exact: true })
    .fill("Conta criada pelo navegador");
  await admin.getByLabel("Valor em reais", { exact: true }).fill("125.50");
  await admin.getByLabel("Vencimento", { exact: true }).fill("2026-11-10");
  await admin
    .getByRole("button", { name: "Enviar para aprovação", exact: true })
    .click();
  await admin
    .getByRole("row")
    .filter({ hasText: "Conta criada pelo navegador" })
    .waitFor();
  const [bill] = await db.transaction((q) =>
    q(
      "SELECT status,amount_cents FROM treasury_bills WHERE description='Conta criada pelo navegador'",
    ),
  );
  if (bill?.status !== "draft" || Number(bill.amount_cents) !== 12550)
    throw new Error("Treasury UI did not persist a draft with exact cents");
  await navigate("Agenda e equipes");
  await admin
    .getByLabel("Nome do recurso", { exact: true })
    .fill("Sala navegador");
  await admin
    .getByRole("button", { name: "Cadastrar recurso", exact: true })
    .click();
  await admin.getByLabel("Sala navegador", { exact: true }).waitFor();
  await admin.getByLabel("Título", { exact: true }).fill("Reunião navegador");
  await admin
    .getByLabel("Início · horário local do dispositivo", { exact: true })
    .fill("2026-11-10T10:00");
  await admin
    .getByLabel("Fim · horário local do dispositivo", { exact: true })
    .fill("2026-11-10T11:00");
  await admin.getByLabel("Sala navegador", { exact: true }).check();
  await admin
    .getByRole("button", { name: "Agendar e reservar", exact: true })
    .click();
  await admin.getByText("Reunião navegador", { exact: true }).waitFor();
  await admin
    .getByRole("button", { name: "Tarefas e acompanhamento", exact: true })
    .click();
  await admin
    .getByLabel("Próxima ação", { exact: true })
    .fill("Conferir documentos do visitante");
  await admin.getByRole("textbox", { name: "Prazo", exact: true }).fill("2026-11-12");
  await admin
    .getByRole("button", { name: "Criar tarefa", exact: true })
    .click();
  await admin
    .getByRole("article")
    .filter({ hasText: "Conferir documentos do visitante" })
    .first()
    .waitFor();
  await mkdir(".local/qa", { recursive: true });
  await admin.screenshot({
    path: ".local/qa/evolucao-tarefas-desktop.png",
    fullPage: true,
  });
  await admin.setViewportSize({ width: 390, height: 844 });
  for (const name of [
    "Secretaria e operação",
    "Contas e aprovações",
    "Agenda e equipes",
  ]) {
    await navigate(name);
    await admin.getByRole("heading", { level: 2 }).last().waitFor();
    if (
      await admin.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw new Error(`Mobile overflow: ${name}`);
  }
  await admin.screenshot({
    path: ".local/qa/evolucao-agenda-mobile.png",
    fullPage: true,
  });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Evolution browser passed: private invitation with MFA, exact treasury request, resource reservation, task persistence, no page errors and mobile layout at 390px.",
  );
} catch (error) {
  await admin.screenshot({
    path: ".local/qa/evolucao-falha.png",
    fullPage: true,
  });
  console.log(
    await admin.evaluate(() =>
      Array.from(document.querySelectorAll("main *"))
        .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 12)
        .map((e) => ({
          tag: e.tagName,
          className: e.className,
          width: e.getBoundingClientRect().width,
        })),
    ),
  );
  throw error;
} finally {
  await publicCatalog.close();
  await browser.close();
  await new Promise((r) => server.close(r));
  await db.close();
}
