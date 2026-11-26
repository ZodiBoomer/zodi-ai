import { NextResponse } from "next/server";
import JSZip from "jszip";
import { OfficeParser } from "officeparser";
import { readXls, readXlsb } from "hucre";
import { toMarkdown as legacyPowerPointToMarkdown } from "@mdgate/ppt";
import { createRequire } from "node:module";

export const runtime = "nodejs";
export const maxDuration = 60;

const require = createRequire(import.meta.url);
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_ARCHIVE_FILES = 100;
const MAX_EXTRACTED_CHARS = 32_000;
const TEXT_EXTENSIONS = new Set([
  "txt","md","markdown","csv","tsv","json","xml","html","htm","css","js","jsx","ts","tsx",
  "py","java","c","cpp","h","hpp","cs","go","rs","php","rb","swift","kt","sql","yaml","yml",
  "toml","ini","conf","log","sh","bash","bat","ps1","env","svg"
]);
const OFFICE_EXTENSIONS = new Set([
  "pdf","doc","docx","docm","dotx","dotm","ppt","pps","pot","xls","xlsb","xlsx","xlsm","xltx","xltm","pptx","pptm","ppsx","ppsm",
  "odt","ods","odp","odg","epub","rtf","tex"
]);

function extension(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

function cap(text: string) {
  return text.slice(0, MAX_EXTRACTED_CHARS);
}

function workbookToText(workbook: { sheets: Array<{ name: string; rows: unknown[][] }> }) {
  return workbook.sheets.map((sheet) => {
    const rows = sheet.rows.map((row) => row.map((cell) => cell == null ? "" : String(cell)).join("\t"));
    return "Feuille : " + sheet.name + "\n" + rows.join("\n");
  }).join("\n\n");
}

async function extractOffice(buffer: Buffer, ext: string) {
  if (ext === "doc") {
    const WordExtractor = require("word-extractor") as new () => {
      extract(input: Buffer): Promise<{ getBody(): string }>;
    };
    const document = await new WordExtractor().extract(buffer);
    return document.getBody();
  }
  if (ext === "ppt" || ext === "pps" || ext === "pot") {
    return await legacyPowerPointToMarkdown(new Uint8Array(buffer));
  }
  if (ext === "xls") {
    return workbookToText(await readXls(new Uint8Array(buffer)));
  }
  if (ext === "xlsb") {
    return workbookToText(await readXlsb(new Uint8Array(buffer)));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 48_000);
  try {
    const ast = await OfficeParser.parseOffice(buffer, {
      fileType: ext === "tex" ? "tex" : undefined,
      extractAttachments: true,
      ocr: true,
      ocrConfig: {
        language: "fra+eng",
        cacheMethod: "none",
        timeout: { workerLoad: 20_000, recognition: 9_000, autoTerminate: 5_000 }
      },
      abortSignal: controller.signal
    });
    const result = await ast.to("text", { includeImages: "image+ocr-text" });
    const text = typeof result.value === "string" ? result.value : JSON.stringify(result.value);
    const warnings = Array.isArray(ast.warnings)
      ? ast.warnings.map((issue) => "[Avertissement de lecture " + issue.code + " : " + issue.message + "]")
      : [];
    return [text, ...warnings].filter(Boolean).join("\n\n");
  } finally {
    clearTimeout(timeout);
  }
}

async function extractZipText(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true, createFolders: false });
  const files = Object.values(zip.files).filter((entry) => !entry.dir);
  if (files.length > MAX_ARCHIVE_FILES) throw new Error("Cette archive contient trop de fichiers (maximum 100).");
  const parts: string[] = [];
  let total = 0;
  for (const entry of files) {
    const ext = extension(entry.name);
    if (!TEXT_EXTENSIONS.has(ext) && !OFFICE_EXTENSIONS.has(ext)) continue;
    const declaredSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    if (declaredSize > MAX_FILE_BYTES || total + declaredSize > MAX_FILE_BYTES) {
      throw new Error("Le contenu décompressé de l’archive dépasse 4 Mo.");
    }
    const data = await entry.async("nodebuffer");
    total += data.byteLength;
    if (total > MAX_FILE_BYTES) throw new Error("Le contenu décompressé de l’archive dépasse 4 Mo.");
    let text = "";
    if (TEXT_EXTENSIONS.has(ext)) {
      text = data.toString("utf8");
    } else {
      try { text = await extractOffice(data, ext); }
      catch { text = "[Fichier non extrait : " + entry.name + "]"; }
    }
    if (text.trim()) parts.push("Fichier : " + entry.name + "\n" + text);
    if (parts.join("\n").length >= MAX_EXTRACTED_CHARS) break;
  }
  if (!parts.length) throw new Error("Aucun fichier texte ou document pris en charge n’a été trouvé dans cette archive ZIP.");
  return parts.join("\n\n");
}

async function transcribeAudio(file: File) {
  const openRouterKey = String(
    process.env.OPENROUTER_API_KEY ||
    (/^sk-or-/i.test(String(process.env.OPENAI_API_KEY || "")) ? process.env.OPENAI_API_KEY : "")
  ).trim();
  const openAiKey = String(
    process.env.OPENAI_DIRECT_API_KEY ||
    (!/^sk-or-/i.test(String(process.env.OPENAI_API_KEY || "")) ? process.env.OPENAI_API_KEY : "")
  ).trim();
  const isOpenRouter = Boolean(openRouterKey);
  const apiKey = isOpenRouter ? openRouterKey : openAiKey;
  if (!apiKey) throw new Error("La transcription nécessite une clé OpenRouter ou OpenAI configurée sur le serveur.");
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("model", isOpenRouter ? "openai/whisper-1" : "whisper-1");
  form.append("response_format", "json");
  const endpoint = isOpenRouter
    ? "https://openrouter.ai/api/v1/audio/transcriptions"
    : "https://api.openai.com/v1/audio/transcriptions";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey },
    body: form,
    signal: AbortSignal.timeout(55_000)
  });
  const result = await response.json().catch(() => ({})) as { text?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || "Le service de transcription a refusé le fichier (HTTP " + response.status + ").");
  if (!result.text?.trim()) throw new Error("Le service de transcription n’a renvoyé aucun texte.");
  return result.text;
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
    } else if (ext === "zip") {
      extracted = await extractZipText(Buffer.from(await file.arrayBuffer()));
      kind = "archive ZIP";
    } else if (OFFICE_EXTENSIONS.has(ext) || ["doc","ppt","pps","pot","xls","xlsb"].includes(ext)) {
      extracted = await extractOffice(Buffer.from(await file.arrayBuffer()), ext);
      kind = ext.toUpperCase();
    } else if (["mp3","wav","m4a","ogg","flac","mpeg","mpga","aac"].includes(ext) || file.type.startsWith("audio/")) {
      extracted = await transcribeAudio(file);
      kind = "transcription audio";
    } else if (["mp4","mov","webm","avi","mkv","mpg"].includes(ext) || file.type.startsWith("video/")) {
      throw new Error("Pour une vidéo, sélectionne-la dans le bouton Vidéos : ZODIX extrait ses images et sa piste audio séparément.");
    } else if (["rar","7z","tar","gz","tgz","bz2","xz"].includes(ext)) {
      throw new Error("Cette archive doit être ouverte depuis le sélecteur de fichiers de ZODIX pour être extraite côté navigateur.");
    } else if (["exe","apk","iso","dmg","bin"].includes(ext)) {
      throw new Error("Ce fichier est un programme ou une image disque, pas un document lisible. ZODIX ne l’exécute pas.");
    } else {
      throw new Error("Format non reconnu ou non pris en charge : ." + (ext || "inconnu"));
    }

    extracted = cap(extracted.trim());
    if (!extracted) throw new Error("Aucun contenu textuel n’a pu être extrait de ce fichier.");
    return NextResponse.json({ ok: true, name: file.name, kind, text: extracted, truncated: extracted.length >= MAX_EXTRACTED_CHARS });
  } catch (error) {
    const message = error instanceof Error
      ? (error.name === "AbortError" ? "La lecture a dépassé le temps autorisé. Essaie un fichier plus court ou plus léger." : error.message)
      : "Impossible de lire ce fichier.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
