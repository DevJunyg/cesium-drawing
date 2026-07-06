import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "core/index": "src/core/index.ts",
    "geometry/index": "src/geometry/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ["cesium"],
  // package.json type=module 이라 esm 은 .js, cjs 는 .cjs 로 명시
  outExtension({ format }) {
    return { js: format === "esm" ? ".js" : ".cjs" };
  },
});
