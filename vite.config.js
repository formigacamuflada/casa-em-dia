import { defineConfig } from "vite";

// base relativa: o mesmo build serve o GitHub Pages (/casa-em-dia/) e o app do Windows (Tauri).
export default defineConfig({
  base: "./",
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: "es2020", outDir: "dist", emptyOutDir: true },
});
