import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["test/client-dashboard.test.tsx", "test/client-motion.test.ts"],
  },
});
