import { spawn } from "node:child_process";
import path from "node:path";

const localModules = "C:\\Users\\USER\\AppData\\Local\\b2b_saas_node_modules\\node_modules";
const tscPath = path.join(localModules, "typescript", "lib", "tsc.js");

const child = spawn(process.execPath, [tscPath, "--noEmit"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_PATH: localModules,
  },
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
