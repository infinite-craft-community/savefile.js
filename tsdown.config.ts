import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { index: "src/index.ts" },
  exports: true,
  unbundle: false,
  dts: true,
});
