import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const localOrigins = Object.values(networkInterfaces()).flatMap((addresses) => addresses ?? [])
  .filter((address) => address.family === "IPv4" && !address.internal)
  .map((address) => address.address);

const config: NextConfig = {
  transpilePackages: ["@launchpad/ui", "@launchpad/shared", "@launchpad/supabase"],
  poweredByHeader: false,
  turbopack: { root: workspaceRoot },
  outputFileTracingRoot: workspaceRoot,
  allowedDevOrigins: ["127.0.0.1", "localhost", ...localOrigins],
};

export default config;
