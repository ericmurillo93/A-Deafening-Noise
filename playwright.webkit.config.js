import { defineConfig, devices } from "@playwright/test";
import { sharedConfig } from "./playwright.shared.js";

export default defineConfig({
  ...sharedConfig,
  testDir: "./tests/e2e",
  workers: 2,
  projects: [
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "webkit-phone", use: { ...devices["iPhone 13"] } },
  ],
});
