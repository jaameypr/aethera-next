import type { NextConfig } from "next";
import pkg from "./package.json";

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
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
};

export default nextConfig;
