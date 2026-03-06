import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "bcryptjs",
    "dockerode",
    "tar-stream",
    "@pruefertit/docker-orchestrator",
  ],
};

export default nextConfig;
