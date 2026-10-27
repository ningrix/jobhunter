/**
 * 生成冒烟用的最小样本：sample.pdf（纯手写 PDF 结构）与 sample.docx（PowerShell 打包的最小 OOXML）。
 * 用法：node desktop/scripts/make-fixtures.mjs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "..", "fixtures");
fs.mkdirSync(OUT, { recursive: true });

// ———— PDF：按对象顺序拼接并记录 xref 偏移，保证结构合法 ————
function buildPdf(text) {
  const objs = [];
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>");
  const stream = `BT /F1 14 Tf 72 760 Td (${text}) Tj ET`;
  objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const pdfPath = path.join(OUT, "sample.pdf");
fs.writeFileSync(
  pdfPath,
  buildPdf("JobHunter smoke test resume: Java backend engineer with MySQL and Kafka experience."),
);
console.log(`[fixtures] ✓ ${pdfPath}`);

// ———— DOCX：最小 OOXML（[Content_Types] / _rels / word/document.xml） ————
const docxPath = path.join(OUT, "sample.docx");
try {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jh-docx-"));
  fs.mkdirSync(path.join(tmp, "_rels"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "word"), { recursive: true });

  fs.writeFileSync(
    path.join(tmp, "[Content_Types].xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  fs.writeFileSync(
    path.join(tmp, "_rels", ".rels"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  fs.writeFileSync(
    path.join(tmp, "word", "document.xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>JobHunter DOCX smoke test</w:t></w:r></w:p>
    <w:p><w:r><w:t>Skills: JavaScript, TypeScript, React, SQLite</w:t></w:r></w:p>
    <w:p><w:r><w:t>Experience: 3 years frontend development in Shanghai.</w:t></w:r></w:p>
  </w:body>
</w:document>`,
  );

  if (fs.existsSync(docxPath)) fs.rmSync(docxPath);
  // Compress-Archive 只认 .zip：先压成 zip 再改名成 .docx
  const zipPath = `${docxPath}.zip`;
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  execFileSync(
    "powershell",
    ["-NoProfile", "-Command", `Compress-Archive -Path '${tmp}\\*' -DestinationPath '${zipPath}' -Force`],
    { stdio: "inherit" },
  );
  fs.renameSync(zipPath, docxPath);
  console.log(`[fixtures] ✓ ${docxPath}`);
} catch (e) {
  console.warn(`[fixtures] ! docx 生成失败（可手动放一个 sample.docx）：${e.message}`);
} finally {
  /* 临时目录留给系统清理 */
}
