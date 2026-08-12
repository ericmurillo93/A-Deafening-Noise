import { defineConfig, devices } from "@playwright/test";
import { sharedConfig } from "./playwright.shared.js";

export default defineConfig({
  ...sharedConfig,
  testDir: "./tests/accessibility",
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
