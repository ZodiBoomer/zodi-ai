import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Remote presentation/configuration only. Native code and Android permissions
// still require a signed APK update; this endpoint never downloads executable code.
export async function GET() {
  const config = {
    schemaVersion: 1,
    configVersion: String(process.env.ZODI_MOBILE_CONFIG_VERSION || "1"),
    subtitle: String(process.env.ZODI_MOBILE_SUBTITLE || "Ton assistant intelligent"),
    announcement: String(process.env.ZODI_MOBILE_ANNOUNCEMENT || ""),
    announcementVersion: String(process.env.ZODI_MOBILE_ANNOUNCEMENT_VERSION || ""),
    features: {
      announcements: true,
      remoteRefresh: true
    }
  };

  return NextResponse.json(config, {
    headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" }
  });
}
