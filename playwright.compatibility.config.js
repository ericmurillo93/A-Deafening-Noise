import { defineConfig, devices } from "@playwright/test";
import { sharedConfig } from "./playwright.shared.js";

export default defineConfig({
  ...sharedConfig,
  testDir: "./tests/compatibility",
  workers: 2,
  projects: [
    ...["chromium", "firefox", "webkit"].flatMap(browserName => [
      { name: `${browserName}-desktop`, use: { browserName, viewport: { width: 1440, height: 900 } } },
      ...["portrait", "landscape"].map(orientation => ({
        name: `${browserName}-${orientation}`,
        use: {
          ...(browserName === "webkit" ? devices[orientation === "portrait" ? "iPhone 13" : "iPhone 13 landscape"] : {}),
          browserName,
          viewport: orientation === "portrait" ? { width: 390, height: 844 } : { width: 844, height: 390 },
          hasTouch: true,
          isMobile: browserName !== "firefox",
        },
      })),
    ]),
    ...(process.env.ADN_BRANDED_BROWSERS === "1" ? [
      { name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
      { name: "msedge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
    ] : []),
  ],
});
