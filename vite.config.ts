import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare({ persistState: { path: ".cloudflare/state" } })],
  server: {
    host: "127.0.0.1",
  },
});
