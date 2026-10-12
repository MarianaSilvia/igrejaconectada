import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const envText = fs.readFileSync(filePath, "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function recordsFrom(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) : [];
}

function maskedOrInvalidServiceKey(value) {
  if (!value) return true;
  if (value.includes("[") || value.includes("]")) return true;
  if (/sensitive|placeholder|tutorial|todo|xxx/i.test(value)) return true;
  return value.length < 80;
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL não está configurada.");
  }

  if (maskedOrInvalidServiceKey(serviceKey)) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não parece ser uma chave administrativa real neste ambiente local. " +
        "Atualize a variável local antes de rodar o diagnóstico direto do Supabase.",
    );
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const states = await supabase.from("church_app_state").select("id,updated_at,payload").limit(5);
  if (states.error) throw new Error(`Falha ao ler church_app_state: ${states.error.message}`);

  const state = (states.data ?? [])[0];
  const membersCount = await supabase.from("members").select("id", { count: "exact", head: true });
  if (membersCount.error) throw new Error(`Falha ao contar members: ${membersCount.error.message}`);

  const jsonMembers = recordsFrom(state?.payload?.members);
  const jsonIds = new Set(jsonMembers.map((member) => String(member.id ?? "")).filter(Boolean));
  const tableIds = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const page = await supabase.from("members").select("id").range(from, from + pageSize - 1);
    if (page.error) throw new Error(`Falha ao ler página de members: ${page.error.message}`);

    const rows = page.data ?? [];
    tableIds.push(...rows.map((row) => String(row.id ?? "")).filter(Boolean));
    if (rows.length < pageSize) break;
  }

  const tableIdSet = new Set(tableIds);
  const missingInJson = tableIds.filter((id) => !jsonIds.has(id)).length;
  const missingInTable = [...jsonIds].filter((id) => !tableIdSet.has(id)).length;
  const membersTableRows = membersCount.count ?? 0;

  console.log(
    JSON.stringify(
      {
        appStateRows: states.data?.length ?? 0,
        selectedStateId: state?.id ?? null,
        churchAppStateMembers: jsonMembers.length,
        membersTableRows,
        missingInJson,
        missingInTable,
        updatedAt: state?.updated_at ?? null,
        aligned: jsonMembers.length === membersTableRows && missingInJson === 0 && missingInTable === 0,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
