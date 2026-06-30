import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

async function findTests(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findTests(fullPath));
    } else if (/\.test\.ts$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const workspaceNode = "C:\\Users\\Ronny\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe";
const node = process.platform === "win32" ? workspaceNode : "node";
const tests = await findTests("tests");

if (tests.length === 0) {
  console.error("Keine Testdateien gefunden.");
  process.exit(1);
}

const child = spawn(node, ["--import", "tsx", "--test", ...tests], {
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => process.exit(code ?? 1));
