import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Aucune image reçue." }, { status: 400 });
    const imageName = /\\.(jpe?g|png|webp|heic|heif|avif|gif|bmp|tiff?)$/i.test(file.name);
    if ((!file.type.startsWith("image/") && !imageName) || !file.size || file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Choisis une image de 4 Mo maximum." }, { status: 413 });
    }
    const input = Buffer.from(await file.arrayBuffer());
    const output = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
    if (output.byteLength > 700 * 1024) {
      return NextResponse.json({ error: "Cette image reste trop volumineuse après compression." }, { status: 413 });
    }
    return NextResponse.json({
      ok: true,
      name: file.name,
      mimeType: "image/jpeg",
      dataUrl: "data:image/jpeg;base64," + output.toString("base64")
    });
  } catch {
    return NextResponse.json({ error: "Format d’image illisible ou endommagé." }, { status: 422 });
  }
}
