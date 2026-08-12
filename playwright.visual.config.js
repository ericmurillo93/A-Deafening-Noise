import { defineConfig } from "@playwright/test";
import { sharedConfig, standardProjects } from "./playwright.shared.js";

export default defineConfig({
  ...sharedConfig,
  testDir: "./tests/visual",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  use: {
    ...sharedConfig.use,
    colorScheme: "dark",
  },
  projects: standardProjects,
});
