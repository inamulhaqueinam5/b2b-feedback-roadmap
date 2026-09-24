import { spawn } from "node:child_process";
import path from "node:path";

const localModules = "C:\\Users\\USER\\AppData\\Local\\b2b_saas_node_modules\\node_modules";
const nextPath = path.join(localModules, "next", "dist", "bin", "next");
const args = process.argv.slice(2);
const child = spawn(process.execPath, [nextPath, ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_PATH: localModules,
    NODE_OPTIONS: "--trace-uncaught",
  },
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
