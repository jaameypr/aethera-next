import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "bcryptjs",
    "dockerode",
    "tar-stream",
    "adm-zip",
    "@pruefertit/docker-orchestrator",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
};

export default nextConfig;
