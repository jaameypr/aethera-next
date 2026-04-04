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
  // Include the backup worker script in the standalone output
  // so child_process.fork() can resolve it at runtime.
  outputFileTracingIncludes: {
    "/": ["./scripts/backup-worker.js"],
  },
};

export default nextConfig;
