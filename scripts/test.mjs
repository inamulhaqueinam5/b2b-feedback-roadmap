import { spawn } from "node:child_process";
import path from "node:path";

const localModules = "C:\\Users\\USER\\AppData\\Local\\b2b_saas_node_modules\\node_modules";
const vitestPath = path.join(localModules, "vitest", "vitest.mjs");

const args = process.argv.slice(2);
if (args.length === 0) {
  args.push("run");
}

const child = spawn(process.execPath, [vitestPath, ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_PATH: localModules,
  },
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
