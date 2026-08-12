import { defineConfig } from "@playwright/test";
import { sharedConfig, standardProjects } from "./playwright.shared.js";

export default defineConfig({
  ...sharedConfig,
  testDir: "./tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  webServer: {
    ...sharedConfig.webServer,
    reuseExistingServer: !process.env.CI,
  },
  projects: standardProjects,
});
