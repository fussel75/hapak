import { rm } from "node:fs/promises";
import { build as viteBuild } from "vite";
import { build as esbuild } from "esbuild";

process.env.NODE_ENV = "production";

await rm("dist", { recursive: true, force: true });

await viteBuild();

await esbuild({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  packages: "external",
  format: "cjs",
  outfile: "dist/index.cjs",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  logLevel: "info",
});
