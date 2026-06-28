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
  // Include standalone helper scripts in the standalone output so they ship in
  // the image: backup-worker.js (forked at runtime for heavy backup I/O).
  outputFileTracingIncludes: {
    "/": ["./scripts/backup-worker.js"],
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
};

export default nextConfig;
