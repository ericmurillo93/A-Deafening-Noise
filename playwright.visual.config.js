import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: true,
  reporter: "list",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  use: {
    baseURL: "http://127.0.0.1:4173",
    colorScheme: "dark",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "env VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= npm run dev -- --port 4173",
    url: "http://127.0.0.1:4173/history",
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-portrait", use: { ...devices["Pixel 5"] } },
    { name: "mobile-landscape", use: { ...devices["Pixel 5 landscape"] } },
  ],
});
