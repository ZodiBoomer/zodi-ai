import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import JSZip from "jszip";
import sharp from "sharp";
import { OfficeParser } from "officeparser";
import { Archive } from "libarchive.js";
import { readXls, readXlsb, writeXlsx } from "hucre";
import { toMarkdown } from "@mdgate/ppt";

const require = createRequire(import.meta.url);
const WordExtractor = require("word-extractor");

async function officeText(buffer, fileType) {
  const ast = await OfficeParser.parseOffice(buffer, { fileType, extractAttachments: true, ocr: false });
  const result = await ast.to("text", { includeImages: "ocr-text-only" });
  return String(result.value ?? "");
}

function makePdf(text) {
  const escaped = text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const stream = `BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

const rtf = Buffer.from(String.raw`{\rtf1\ansi ZODIX RTF smoke test}`);
assert.match(await officeText(rtf, "rtf"), /ZODIX RTF smoke test/);

const docxZip = new JSZip();
docxZip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
docxZip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
docxZip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>ZODIX DOCX smoke test</w:t></w:r></w:p></w:body></w:document>`);
const docx = await docxZip.generateAsync({ type: "nodebuffer" });
assert.match(await officeText(docx, "docx"), /ZODIX DOCX smoke test/);

const xlsx = await writeXlsx({ sheets: [{ name: "Smoke", columns: [{ header: "Message", key: "message" }], data: [{ message: "ZODIX XLSX smoke test" }] }] });
assert.match(await officeText(Buffer.from(xlsx), "xlsx"), /ZODIX XLSX smoke test/);

const pdf = makePdf("ZODIX PDF smoke test");
assert.match(await officeText(pdf, "pdf"), /ZODIX PDF smoke test/);

const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 12, g: 34, b: 56 } } }).png().toBuffer();
const jpeg = await sharp(png).jpeg().toBuffer();
assert.ok(jpeg.length > 0);

assert.equal(typeof Archive.open, "function");
assert.equal(typeof readXls, "function");
assert.equal(typeof readXlsb, "function");
assert.equal(typeof toMarkdown, "function");
assert.equal(typeof WordExtractor, "function");
assert.ok(existsSync("public/libarchive-worker.js"), "libarchive worker asset was not copied during postinstall");
assert.ok(existsSync("public/libarchive.wasm"), "libarchive WebAssembly asset was not copied during postinstall");

console.log("File-reader smoke tests passed: PDF, DOCX, XLSX, RTF, Sharp image conversion and reader/worker package entry points.");
