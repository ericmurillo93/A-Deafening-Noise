import { devices } from "@playwright/test";

export const sharedConfig = {
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
};

export const standardProjects = [
  { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  { name: "mobile-portrait", use: { ...devices["Pixel 5"] } },
  { name: "mobile-landscape", use: { ...devices["Pixel 5 landscape"] } },
];
