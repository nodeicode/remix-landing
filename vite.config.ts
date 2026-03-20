import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import esbuild from "esbuild";
import path from "path";

function serviceWorkerPlugin(): Plugin {
  const swSrc = path.resolve(__dirname, "app/sw.ts");
  const swDest = path.resolve(__dirname, "public/sw.js");

  async function buildSW() {
    await esbuild.build({
      entryPoints: [swSrc],
      outfile: swDest,
      bundle: false,
      format: "iife",
      target: ["chrome90", "firefox88", "safari15"],
      sourcemap: false,
    });
  }

  return {
    name: "service-worker",
    async buildStart() {
      await buildSW();
    },
    configureServer(server) {
      server.watcher.add(swSrc);
      server.watcher.on("change", async (file) => {
        if (file === swSrc) {
          await buildSW();
          server.ws.send({ type: "full-reload" });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [serviceWorkerPlugin(), tailwindcss(), reactRouter(), tsconfigPaths()],
});