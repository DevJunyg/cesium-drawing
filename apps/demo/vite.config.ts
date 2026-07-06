import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react(), cesium()],
  resolve: {
    // 워크스페이스 패키지를 소스로 직접 참조 (dist 빌드 불필요)
    alias: [
      {
        find: /^cesium-drawing-react$/,
        replacement: src("../../packages/cesium-drawing-react/src/index.ts"),
      },
      {
        find: /^cesium-drawing$/,
        replacement: src("../../packages/cesium-drawing/src/index.ts"),
      },
    ],
  },
});
