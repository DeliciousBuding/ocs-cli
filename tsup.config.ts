import { defineConfig } from "tsup";
import { readFileSync, writeFileSync } from "fs";

export default defineConfig({
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
});
