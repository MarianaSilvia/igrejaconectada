export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function csvValue(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const content = [headers, ...rows].map((row) => row.map(csvValue).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function printHtmlReport(title: string, subtitle: string, headers: string[], rows: unknown[][]) {
  const reportWindow = window.open("", "_blank", "noopener,noreferrer,width=980,height=720");

  if (!reportWindow) return false;

  const bodyRows = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell ?? ""))}</td>`).join("")}</tr>`).join("");
  const headRows = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");

  reportWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { color: #111827; font-family: Arial, sans-serif; margin: 30px; }
          header { border-bottom: 3px solid #0f766e; margin-bottom: 20px; padding-bottom: 12px; }
          h1 { font-size: 24px; margin: 0 0 6px; }
          p { color: #4b5563; margin: 0; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #d1d5db; font-size: 12px; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #f3f4f6; }
          button { margin-bottom: 16px; padding: 10px 14px; }
          @media print { body { margin: 18mm; } button { display: none; } }
        </style>
      </head>
      <body>
        <button onclick="window.print()">Salvar em PDF / Imprimir</button>
        <header>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </header>
        <table>
          <thead><tr>${headRows}</tr></thead>
          <tbody>${bodyRows || `<tr><td colspan="${headers.length}">Nenhum registro encontrado.</td></tr>`}</tbody>
        </table>
      </body>
    </html>
  `);
  reportWindow.document.close();
  return true;
}
