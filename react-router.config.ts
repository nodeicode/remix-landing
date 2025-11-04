import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  prerender: true,
  // Ensure API routes are treated as server functions
  serverBuildFile: "index.js",
  serverModuleFormat: "esm",
} satisfies Config;