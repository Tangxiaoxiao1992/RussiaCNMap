import { defineConfig } from "vite";
// 相对路径：既能放在 Capacitor 的 https://localhost/ 下，也能放在 GitHub Pages 的子路径下
export default defineConfig({ base: "./", build: { chunkSizeWarningLimit: 1500 } });
