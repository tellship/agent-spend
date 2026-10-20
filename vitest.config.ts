import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // A fixed zone with a half-hour offset, so local-time formatting is deterministic and not mistaken for UTC.
    env: { TZ: "Asia/Kolkata" },
  },
});
