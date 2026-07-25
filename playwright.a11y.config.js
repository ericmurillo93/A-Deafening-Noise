import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/accessibility",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "env VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= npm run dev -- --port 4173",
    url: "http://127.0.0.1:4173/history",
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
