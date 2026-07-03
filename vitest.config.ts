import { defineConfig } from "vitest/config";

// Standalone config so unit tests don't load the React Router Vite plugin.
// The domain logic under test (app/lib/*) is framework-free by design.
export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
});
