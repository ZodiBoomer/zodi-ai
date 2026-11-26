import { NextResponse } from "next/server";
import JSZip from "jszip";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 120_000;
const TEXT_EXTENSIONS = new Set([
  "txt","md","markdown","csv","tsv","json","xml","html","htm","css","js","jsx","ts","tsx",
  "py","java","c","cpp","h","hpp","cs","go","rs","php","rb","swift","kt","sql","yaml","yml",
  "toml","ini","conf","log","sh","bash","bat","ps1","env","svg","tex"
]);

function extension(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

function decodeXml(value: string) {
  return value.replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, " ").trim();
}

function cap(text: string) {
  return text.slice(0, MAX_EXTRACTED_CHARS);
}

async function extractZipText(buffer: Buffer, ext: string) {
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
  const files = Object.values(zip.files).filter((entry) => !entry.dir);
  if (files.length > 200) throw new Error("Cette archive contient trop de fichiers (maximum 200).");
  const parts: string[] = [];
  let total = 0;

  if (ext === "epub") {
    for (const entry of files.filter((item) => /\\.(xhtml|html|htm)$/i.test(item.name)).sort((a,b)=>a.name.localeCompare(b.name))) {
      const markup = await entry.async("text");
      parts.push(decodeXml(markup));
      if (parts.join("\\n").length > MAX_EXTRACTED_CHARS) break;
    }
    if (!parts.length) throw new Error("Aucun texte HTML n’a été trouvé dans cet EPUB.");
    return parts.join("\\n\\n");
  }
  if (["docx","docm"].includes(ext)) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (["xls","xlsx","xlsm","xlsb","xltx","ods"].includes(ext)) {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    for (const sheetName of workbook.SheetNames) {
      parts.push("Feuille : " + sheetName + "\n" + XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]));
    }
    return parts.join("\n\n");
  }
  if (["pptx","pptm","ppsx","odp"].includes(ext)) {
    const slides = files.filter((entry) => /(?:ppt\/slides\/slide\d+\.xml|content\.xml)$/i.test(entry.name)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
    for (const slide of slides) {
      const xml = await slide.async("text");
      parts.push(decodeXml(xml));
    }
    return parts.join("\n\n");
  }
  if (["odt"].includes(ext)) {
    const entry = zip.file("content.xml");
    if (!entry) throw new Error("Le document ODT ne contient pas de texte lisible.");
    return decodeXml(await entry.async("text"));
  }
  if (["zip"].includes(ext)) {
    for (const entry of files) {
      const fileExt = extension(entry.name);
      if (!TEXT_EXTENSIONS.has(fileExt)) continue;
      const data = await entry.async("nodebuffer");
      total += data.byteLength;
      if (total > MAX_FILE_BYTES) throw new Error("Le contenu décompressé de l’archive dépasse 4 Mo.");
      parts.push("Fichier : " + entry.name + "\n" + data.toString("utf8"));
      if (parts.join("\n").length > MAX_EXTRACTED_CHARS) break;
    }
    if (!parts.length) throw new Error("Aucun fichier texte pris en charge n’a été trouvé dans cette archive ZIP.");
    return parts.join("\n\n");
  }
  throw new Error("Format d’archive ou de document non pris en charge.");
}

async function extractPdf(buffer: Buffer) {
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const pdf = await task.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => "str" in item ? item.str : "").join(" ");
    pages.push("Page " + pageNumber + " : " + text);
    if (pages.join("\n").length > MAX_EXTRACTED_CHARS) break;
  }
  await pdf.destroy();
  const result = pages.join("\n\n").trim();
  if (!result) throw new Error("Aucun texte détectable dans ce PDF. S’il s’agit d’un scan, une reconnaissance OCR est nécessaire.");
  return result;
}

async function transcribeAudio(file: File) {
  const apiKey = String(process.env.OPENAI_DIRECT_API_KEY ||
    (String(process.env.OPENAI_API_KEY || "").startsWith("sk-") && !String(process.env.OPENAI_API_KEY || "").startsWith("sk-or-") ? process.env.OPENAI_API_KEY : "")).trim();
  if (!apiKey) throw new Error("La transcription audio nécessite une clé OpenAI directe. Le fournisseur OpenRouter seul ne suffit pas pour cette fonction.");
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("model", "whisper-1");
  form.append("response_format", "text");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey },
    body: form,
    signal: AbortSignal.timeout(55_000)
  });
  if (!response.ok) throw new Error("Le service de transcription audio a refusé le fichier (HTTP " + response.status + ").");
  return await response.text();
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
    if (!file.size || file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "Le fichier doit faire entre 1 octet et 4 Mo." }, { status: 413 });

    const ext = extension(file.name);
    let extracted = "";
    let kind = "document";
    if (TEXT_EXTENSIONS.has(ext) || file.type.startsWith("text/") || file.type === "application/json") {
      extracted = await file.text();
      kind = "texte";
    } else if (ext === "pdf" || file.type === "application/pdf") {
      extracted = await extractPdf(Buffer.from(await file.arrayBuffer()));
      kind = "PDF";
    } else if (["docx","docm","xlsx","xls","xlsm","xlsb","xltx","ods","pptx","pptm","ppsx","odp","odt","epub","zip"].includes(ext)) {
      extracted = await extractZipText(Buffer.from(await file.arrayBuffer()), ext);
      kind = ext.toUpperCase();
    } else if (["mp3","wav","m4a","ogg","flac","mpeg","mpga"].includes(ext) || file.type.startsWith("audio/")) {
      extracted = await transcribeAudio(file);
      kind = "transcription audio";
    } else if (["mp4","mov","webm","avi","mkv","mpeg","mpg"].includes(ext) || file.type.startsWith("video/")) {
      throw new Error("Pour une vidéo, ZODIX doit encore extraire les images et la piste audio séparément. Ce lecteur vidéo sera ajouté dans une prochaine étape.");
    } else if (ext === "rtf") {
      const raw = await file.text();
      extracted = raw.replace(/\\\\'[0-9a-f]{2}/gi, (match) => String.fromCharCode(parseInt(match.slice(2), 16)))
        .replace(/\\\\par[d]?\\b/g, "\\n").replace(/\\\\'[0-9a-f]{2}/gi, "")
        .replace(/\\\\[a-z]+-?\\d* ?/gi, "").replace(/[{}]/g, "").replace(/\\s+/g, " ").trim();
      kind = "RTF";
    } else if (["doc","ppt","rar","7z","exe","apk","iso","dmg","bin"].includes(ext)) {
      throw new Error("Ce format binaire n’est pas encore pris en charge par le lecteur intégré.");
    } else {
      throw new Error("Format non reconnu ou non pris en charge : ." + (ext || "inconnu"));
    }

    extracted = cap(extracted.trim());
    if (!extracted) throw new Error("Aucun contenu textuel n’a pu être extrait de ce fichier.");
    return NextResponse.json({ ok: true, name: file.name, kind, text: extracted, truncated: extracted.length >= MAX_EXTRACTED_CHARS });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossible de lire ce fichier." }, { status: 422 });
  }
}
