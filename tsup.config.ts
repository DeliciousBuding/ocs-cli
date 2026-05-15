import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      "cli/index": "src/cli/index.ts",
      "index": "src/index.ts",
      "mcp/entry": "src/mcp/entry.ts",
    },
    format: ["esm"],
    target: "node20",
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    banner: (args) => {
      if (args?.entryName === "cli/index") {
        return { js: "#!/usr/bin/env node" };
      }
      return {};
    },
  },
]);
