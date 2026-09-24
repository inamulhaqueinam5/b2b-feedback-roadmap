import type { NextConfig } from "next";
import path from "node:path";

const localModules = "C:/Users/USER/AppData/Local/b2b_saas_node_modules/node_modules";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.modules = [
      localModules,
      path.resolve(__dirname, "node_modules"),
      "node_modules",
      ...(config.resolve.modules || []),
    ];
    return config;
  },
};

export default nextConfig;
