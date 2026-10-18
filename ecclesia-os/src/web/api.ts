export type RecordData = Record<string, any>;
let selectedChurch = "";
export function selectChurch(id: string) {
  selectedChurch = id;
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(selectedChurch ? { "x-church-id": selectedChurch } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      [
        data.error ?? "Operação indisponível.",
        ...(data.details ?? []).map((issue: RecordData) => issue.message),
      ].join(" "),
    );
  return data;
}
export const money = (n: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(n ?? 0) / 100,
  );
export { shortDate } from "../shared/dates";
export function csvDownload(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadReceipt(id: string) {
  const res = await fetch(`/api/pix/charges/${id}/receipt`, {
    headers: { "x-church-id": selectedChurch },
  });
  if (!res.ok) throw new Error("Comprovante indisponível.");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `comprovante-${id}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
