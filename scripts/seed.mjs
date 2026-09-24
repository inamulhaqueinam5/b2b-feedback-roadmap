import { spawn } from "node:child_process";
import path from "node:path";

const localModules = "C:\\Users\\USER\\AppData\\Local\\b2b_saas_node_modules\\node_modules";
const vitestPath = path.join(localModules, "vitest", "vitest.mjs");

console.log("Seeding B2B Feedback & Product Roadmap Platform...");

const child = spawn(
  process.execPath,
  [vitestPath, "run", "src/__tests__/seed-and-e2e-journey.test.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_PATH: localModules,
    },
  }
);

child.on("exit", (code) => {
  if (code === 0) {
    console.log("Database seeded successfully with demo workspace 'acme-cloud'!");
  } else {
    console.error("Database seed failed with exit code:", code);
  }
  process.exit(code ?? 0);
});
