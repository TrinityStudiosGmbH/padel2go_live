import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Isolate the heaviest libraries into their own cacheable chunks so they
        // are downloaded once and only for the routes that use them (3D hero on the
        // landing page, charts on admin/utilization, the rich-text editor on admin news).
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("three") || id.includes("@react-three") || id.includes("@splinetool")) return "vendor-three";
          if (id.includes("recharts") || id.includes("/d3-")) return "vendor-charts";
          if (id.includes("@tiptap") || id.includes("prosemirror")) return "vendor-editor";
        },
      },
    },
  },
}));
