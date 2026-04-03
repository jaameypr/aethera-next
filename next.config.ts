import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "bcryptjs",
    "dockerode",
    "tar-stream",
    "yauzl",
    "archiver",
    "@pruefertit/docker-orchestrator",
  ],
};

export default nextConfig;
