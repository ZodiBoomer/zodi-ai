export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? process.env.NEXT_PUBLIC_ZODI_BUILD_ID ?? "unknown";
  return Response.json({ app: "ZODIX", version: "1.7.1", buildId }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate", Pragma: "no-cache", Expires: "0" } });
}
