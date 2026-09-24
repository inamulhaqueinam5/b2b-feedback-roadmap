import { defineConfig } from "vitest/config";
import path from "node:path";
import pkg from "./package.json";

const localModules = "C:/Users/USER/AppData/Local/b2b_saas_node_modules/node_modules";

const packageAliases: Record<string, string> = {
  "@": path.resolve(__dirname, "./src"),
};

for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
  packageAliases[dep] = path.join(localModules, dep);
}

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: packageAliases,
  },
});
