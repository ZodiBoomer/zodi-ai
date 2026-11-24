import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Expose the deployment commit in the client bundle so the web updater can
  // compare the loaded app with the currently active Vercel deployment.
  env: {
    NEXT_PUBLIC_ZODI_BUILD_ID:
      process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local"
  }
};

export default nextConfig;
