import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "zodi-ai-core",
    aiConfigured: Boolean(process.env.AI_API_KEY),
    providerBaseConfigured: Boolean(process.env.AI_BASE_URL),
    modelConfigured: Boolean(process.env.AI_MODEL)
  });
}
