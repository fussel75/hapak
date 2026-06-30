import { createLogger, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const logger = createLogger();
const originalWarnOnce = logger.warnOnce.bind(logger);

logger.warnOnce = (message, options) => {
  // Tailwind 3 preflight triggers this known Vite warning internally; keep other warnings visible.
  if (message.includes("A PostCSS plugin did not pass the `from` option to `postcss.parse`")) return;
  originalWarnOnce(message, options);
};

export default defineConfig({
  customLogger: logger,
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "client", "src"),
      "@shared": path.resolve(rootDir, "shared"),
      "@assets": path.resolve(rootDir, "attached_assets"),
    },
  },
  root: path.resolve(rootDir, "client"),
  build: {
    outDir: path.resolve(rootDir, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@tiptap") || id.includes("prosemirror")) return "editor-vendor";
          if (id.includes("@radix-ui")) return "ui-vendor";
          if (id.includes("lucide-react") || id.includes("react-icons")) return "icons-vendor";
          if (id.includes("recharts") || id.includes("d3-")) return "charts-vendor";
          return "vendor";
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
