import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_MODULE
  ? require(process.env.PLAYWRIGHT_MODULE)
  : await import("playwright");
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: "msedge" }) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(process.env.TEST_ORIGIN ?? "http://localhost:3100");
  await page
    .getByRole("button", { name: "Administração local admin@esperanca.demo" })
    .click();
  await page.getByRole("button", { name: "Entrar na comunidade" }).click();
  await page.getByRole("button", { name: "Confirmar e entrar" }).click();
  await page
    .getByRole("heading", { name: "Olá, Mariana. Vamos cuidar?" })
    .waitFor();
  await page.getByText("Generosidade que transforma").waitFor();
  await mkdir(".local/qa", { recursive: true });
  await page.screenshot({
    path: ".local/qa/dashboard-dark.png",
    fullPage: true,
  });
  for (const name of [
    "Pessoas e famílias",
    "Células e cuidado",
    "Tesouraria e Pix",
    "Governança",
    "Portal do membro",
  ]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name, exact: true })
      .click();
    await page.getByRole("heading", { name, exact: true, level: 1 }).waitFor();
    await page.waitForTimeout(300);
  }
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Visão geral", exact: true })
    .click();
  await page.getByText("Generosidade que transforma").waitFor();
  await page.getByRole("button", { name: "Ativar modo Alvorada" }).click();
  await page.screenshot({
    path: ".local/qa/dashboard-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Modo sênior" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".local/qa/dashboard-mobile.png",
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (overflow) throw new Error("Horizontal overflow at 390px");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Browser smoke passed: login + MFA, 6 pages, dark/light, senior and 390px viewport.",
  );
} finally {
  await browser.close();
}
