import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function pdfAssets(): Plugin {
  const pdfDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.resolve("pdfjs-dist"))), "..");
  const folders = ["cmaps", "standard_fonts", "wasm", "iccs"];
  const files = new Set(["LICENSE", ...folders.flatMap((folder) =>
    readdirSync(path.join(pdfDirectory, folder)).map((name) => `${folder}/${name}`),
  )]);
  return {
    name: "yardwork-pdf-assets",
    configureServer(server) {
      server.middlewares.use(`${server.config.base}plan-pdf`, (request, response, next) => {
        const name = request.url?.slice(1).split("?")[0];
        if (!name || !files.has(name)) return next();
        const type = name.endsWith(".wasm") ? "application/wasm"
          : name.endsWith(".js") ? "text/javascript" : "application/octet-stream";
        response.setHeader("Content-Type", type);
        response.end(readFileSync(path.join(pdfDirectory, name)));
      });
    },
    generateBundle() {
      for (const name of files) {
        this.emitFile({
          type: "asset",
          fileName: `plan-pdf/${name}`,
          source: readFileSync(path.join(pdfDirectory, name)),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), pdfAssets()],
  build: { chunkSizeWarningLimit: 1400 },
  server: { host: "127.0.0.1" },
});
