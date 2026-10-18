import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import express from "express";
import sharp from "sharp";
import { Database } from "../src/server/db.ts";
import { seed, IDS } from "../src/server/seed.ts";
import { randomUUID } from "node:crypto";
import { encrypt } from "../src/server/security.ts";
import {
  defaultProfile,
  defaultAdministration,
} from "../src/shared/registration.ts";
import { createApp } from "../src/server/app.ts";
import { Efi } from "../src/server/efi.ts";
const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_MODULE
  ? require(process.env.PLAYWRIGHT_MODULE)
  : await import("playwright");
const db = new Database(undefined);
await db.migrate();
await seed(db);
const options = {
  key: Buffer.alloc(32, 8),
  mode: "demo",
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
    viewport: { width: 1440, height: 1000 },
  }),
  errors = [];
admin.on("pageerror", (e) => errors.push(e.message));
await mkdir(".local/qa", { recursive: true });
const fixture = path.resolve(".local/qa/foto-teste-cadastro.jpg");
await sharp({
  create: { width: 800, height: 1000, channels: 3, background: "#a88abd" },
})
  .jpeg()
  .toFile(fixture);
try {
  await admin.goto(options.origin);
  await admin
    .getByRole("button", { name: "Administração local admin@esperanca.demo" })
    .click();
  await admin.getByRole("button", { name: "Entrar na comunidade" }).click();
  await admin.getByRole("button", { name: "Confirmar e entrar" }).click();
  await admin
    .getByRole("navigation")
    .getByRole("button", { name: "Pessoas e famílias", exact: true })
    .click();
  await admin.getByRole("button", { name: "Fichas e link" }).click();
  await admin
    .getByRole("button", { name: "Link da ficha", exact: true })
    .click();
  await admin.getByRole("button", { name: "Gerar link de prévia" }).click();
  await admin
    .getByRole("button", { name: "Gerar prévia da ficha", exact: true })
    .click();
  const link = await admin
    .getByRole("textbox", {
      name: "Endereço da ficha Ficha de cadastro de membros",
    })
    .inputValue();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const member = await context.newPage();
  member.on("pageerror", (e) => errors.push(e.message));
  await member.goto(link);
  await member
    .getByRole("heading", { name: "Ficha de cadastro de membros", exact: true })
    .waitFor();
  await member.getByLabel("Nome *", { exact: true }).fill("Fernanda");
  await member.getByLabel("Sobrenome", { exact: true }).fill("Cadastro Online");
  await member
    .getByLabel("Data de nascimento", { exact: true })
    .fill("1995-05-10");
  await member
    .getByLabel("Telefone 1 / WhatsApp", { exact: true })
    .fill("11912345678");
  await member
    .getByLabel("E-mail", { exact: true })
    .fill("fernanda-cadastro@example.invalid");
  await member
    .getByLabel("Igreja / congregação *", { exact: true })
    .fill("Congregação informada manualmente");
  await member
    .getByLabel("Upload da foto do membro", { exact: true })
    .setInputFiles(fixture);
  await member
    .getByLabel("CPF (opcional)", { exact: true })
    .fill("529.982.247-25");
  await member
    .getByRole("checkbox", {
      name: "Li o aviso e concordo em enviar meus dados para análise da secretaria. *",
      exact: true,
    })
    .check();
  await member.evaluate(() => window.scrollTo(0, 0));
  await member.screenshot({
    path: ".local/qa/ficha-cadastro-desktop.png",
    fullPage: true,
  });
  await member.setViewportSize({ width: 390, height: 844 });
  await member.evaluate(() => window.scrollTo(0, 0));
  await member.screenshot({
    path: ".local/qa/ficha-cadastro-mobile.png",
    fullPage: true,
  });
  if (
    await member.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    )
  )
    throw new Error("Overflow in public form at 390px");
  await member
    .getByRole("button", { name: "Enviar minha ficha", exact: true })
    .click();
  await member
    .getByRole("heading", { name: "Recebemos sua ficha!", exact: true })
    .waitFor();
  await admin.reload();
  await admin
    .getByRole("navigation")
    .getByRole("button", { name: "Pessoas e famílias", exact: true })
    .click();
  await admin.getByRole("button", { name: "Fichas e link" }).click();
  await admin.getByRole("button", { name: "Conferir ficha" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Nome *", { exact: true }).waitFor();
  await dialog
    .getByLabel("Cargos (separe por vírgula)", { exact: true })
    .fill("Voluntária");
  await admin.screenshot({
    path: ".local/qa/ficha-conferencia-secretaria.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Aprovar e cadastrar membro", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  const row = admin
    .getByRole("row")
    .filter({ hasText: "Fernanda Cadastro Online" });
  await row.getByRole("button", { name: "Editar", exact: true }).click();
  await admin
    .getByRole("dialog")
    .getByLabel("Telefone 2", { exact: true })
    .fill("1134567890");
  await admin
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar ficha do membro", exact: true })
    .click();
  await admin.getByRole("dialog").waitFor({ state: "hidden" });
  await row.getByRole("button", { name: "Editar", exact: true }).click();
  if (
    (await admin
      .getByRole("dialog")
      .getByLabel("Telefone 2", { exact: true })
      .inputValue()) !== "1134567890"
  )
    throw new Error("Edited profile was not persisted");
  await admin
    .getByRole("dialog")
    .getByRole("button", { name: "Fechar", exact: true })
    .click();
  await admin
    .getByRole("button", { name: "Cadastrar membro", exact: true })
    .click();
  await admin
    .getByRole("dialog")
    .getByLabel("Nome *", { exact: true })
    .fill("Marcos");
  await admin
    .getByRole("dialog")
    .getByLabel("Sobrenome", { exact: true })
    .fill("Cadastro Manual");
  await admin
    .getByRole("dialog")
    .getByLabel("Igreja / congregação", { exact: true })
    .fill("Congregação da secretaria");
  await admin
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar ficha do membro", exact: true })
    .click();
  await admin
    .getByRole("row")
    .filter({ hasText: "Marcos Cadastro Manual" })
    .waitFor();
  // Race regression: an earlier profile response must never replace the selected destination.
  const candidates = [];
  for (const suffix of ["A", "B"]) {
    const response = await admin.request.post(
      options.origin + "/api/people/profiles",
      {
        headers: { "x-church-id": IDS.churchA },
        data: {
          profile: {
            ...defaultProfile("Candidato"),
            lastName: suffix,
            email: "corrida@example.invalid",
            congregation: "Teste de conferência",
          },
          administration: {
            ...defaultAdministration(),
            notes: "Destino " + suffix,
          },
        },
      },
    );
    if (response.status() !== 201)
      throw new Error("Race fixture profile could not be created");
    candidates.push((await response.json()).id);
  }
  await db.transaction(async (q) => {
    const [l] = await q(
      "SELECT id FROM registration_links WHERE church_id=$1 LIMIT 1",
      [IDS.churchA],
    );
    const payload = {
      profile: {
        ...defaultProfile("Ficha"),
        lastName: "Concorrente",
        email: "corrida@example.invalid",
        congregation: "Teste de conferência",
      },
    };
    await q(
      "INSERT INTO registration_submissions(church_id,link_id,submission_key,encrypted_payload) VALUES($1,$2,$3,$4)",
      [
        IDS.churchA,
        l.id,
        randomUUID(),
        encrypt(JSON.stringify(payload), options.key),
      ],
    );
  });
  await admin.reload();
  await admin
    .getByRole("navigation", { name: "Menu principal" })
    .getByRole("button", { name: "Pessoas e famílias", exact: true })
    .click();
  await admin
    .getByRole("button", { name: "Fichas e link", exact: true })
    .click();
  await admin
    .getByRole("button", { name: "Conferir ficha", exact: true })
    .click();
  let releaseLate;
  const releaseGate = new Promise((resolve) => {
    releaseLate = resolve;
  });
  await admin.route(`**/api/people/${candidates[0]}/profile`, async (route) => {
    const response = await route.fetch();
    await releaseGate;
    await route.fulfill({ response });
  });
  const late = admin.waitForResponse((r) =>
    r.url().endsWith(`/people/${candidates[0]}/profile`),
  );
  const requested = admin.waitForRequest((r) =>
    r.url().endsWith(`/people/${candidates[0]}/profile`),
  );
  const destination = admin
    .getByRole("dialog")
    .getByLabel("Destino desta ficha", { exact: true });
  await destination.selectOption(candidates[0]);
  await requested;
  await destination.selectOption(candidates[1]);
  await admin.waitForFunction(() =>
    Array.from(document.querySelectorAll("textarea")).some(
      (el) => el.value === "Destino B",
    ),
  );
  releaseLate();
  await late;
  await admin.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const notes = admin
    .getByRole("dialog")
    .getByLabel("Anotações administrativas", { exact: true });
  await notes.waitFor();
  if ((await notes.inputValue()) !== "Destino B")
    throw new Error(
      "A stale response replaced the selected member administration",
    );
  await admin
    .getByRole("dialog")
    .getByRole("button", { name: "Fechar", exact: true })
    .click();
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Registration browser passed: local link, anonymous submission with photo, manual congregation, 390px layout, staff approval, profile editing and manual registration.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await db.close();
}
