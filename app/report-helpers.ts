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

export function printHtmlDocument(title: string, bodyHtml: string) {
  const reportWindow = window.open("", "_blank", "noopener,noreferrer,width=980,height=720");

  if (!reportWindow) return false;

  reportWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 30px; }
          button { margin-bottom: 18px; padding: 10px 14px; }
          .document-page { border: 1px solid #d1d5db; min-height: 920px; padding: 34px; }
          .document-header { border-bottom: 3px solid #0f766e; margin-bottom: 26px; padding-bottom: 14px; text-align: center; }
          .document-header strong { display: block; font-size: 22px; letter-spacing: .04em; text-transform: uppercase; }
          .document-header span { color: #4b5563; display: block; font-size: 12px; margin-top: 4px; }
          h1 { font-size: 26px; margin: 0 0 18px; text-align: center; }
          h2 { font-size: 15px; margin: 0 0 10px; }
          .eyebrow { color: #0f766e; font-size: 12px; font-weight: 700; letter-spacing: .08em; margin: 0 0 4px; text-transform: uppercase; }
          .doc-text { font-size: 15px; line-height: 1.8; margin: 16px 0; text-align: justify; }
          .doc-place { margin: 26px 0 10px; text-align: right; }
          .doc-section { border: 1px solid #e5e7eb; border-radius: 10px; margin: 14px 0; padding: 14px; }
          .doc-grid { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .doc-field { border-bottom: 1px solid #e5e7eb; padding-bottom: 7px; }
          .doc-field span { color: #6b7280; display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; }
          .doc-field strong { display: block; font-size: 12px; margin-top: 3px; }
          .member-file-header { align-items: center; display: flex; gap: 18px; margin-bottom: 20px; }
          .member-file-header h1 { margin: 0 0 4px; text-align: left; }
          .member-file-photo { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; height: 128px; object-fit: contain; width: 96px; }
          .member-file-photo.placeholder { align-items: center; color: #0f766e; display: flex; font-size: 34px; font-weight: 800; justify-content: center; }
          .certificate { border: 8px double #0f766e; min-height: 650px; padding: 70px 50px; text-align: center; }
          .certificate h1 { font-size: 34px; }
          .certificate strong { display: block; font-size: 30px; margin: 26px 0; }
          .signature-block { margin: 70px auto 0; max-width: 340px; text-align: center; }
          .signature-block span { border-top: 1px solid #111827; display: block; height: 1px; margin-bottom: 8px; }
          .doc-footer-note { color: #6b7280; font-size: 11px; margin-top: 16px; }
          @media print {
            body { margin: 12mm; }
            button { display: none; }
            .document-page { border: 0; min-height: auto; padding: 0; }
          }
        </style>
      </head>
      <body>
        <button onclick="window.print()">Gerar PDF / Imprimir</button>
        <main class="document-page">
          <header class="document-header">
            <strong>Igreja Conectada</strong>
            <span>Documento gerado pelo sistema de gestão da igreja</span>
          </header>
          ${bodyHtml}
        </main>
      </body>
    </html>
  `);
  reportWindow.document.close();
  return true;
}
