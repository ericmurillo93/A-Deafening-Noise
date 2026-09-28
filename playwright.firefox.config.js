import { defineConfig, devices } from "@playwright/test";
import { sharedConfig } from "./playwright.shared.js";
export default defineConfig({
  ...sharedConfig,
  testDir: "./tests/e2e",
  workers: 2,
  projects: [{ name: "firefox-desktop", use: { ...devices["Desktop Firefox"] } }],
});
