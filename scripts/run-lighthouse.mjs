import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { launch as launchChrome } from "chrome-launcher";
import lighthouse from "lighthouse";

const root = process.cwd();
const port = 4174;
const baseUrl = `http://127.0.0.1:${port}`;
const chromeProfile = path.join(tmpdir(), `adn-lighthouse-${process.pid}`);
const auditEnvironment = {
  ...process.env,
  VITE_SUPABASE_URL: "",
  VITE_SUPABASE_PUBLISHABLE_KEY: "",
  VITE_QUALITY_AUDIT: "true",
};

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with status ${code}`)));
  });
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Preview server did not start at ${url}`);
}

await run("npm", ["run", "build"], { env: auditEnvironment });
const preview = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: root,
  env: auditEnvironment,
  stdio: "inherit",
});

let chrome;
try {
  await waitForServer(`${baseUrl}/history`);
  await mkdir(chromeProfile, { recursive: true });
  chrome = await launchChrome({
    chromePath: chromium.executablePath(),
    chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage", `--user-data-dir=${chromeProfile}`],
    userDataDir: chromeProfile,
  });

  const minimumScores = { performance: 0.7, accessibility: 0.9, "best-practices": 0.9, seo: 0.85 };
  let failed = false;
  for (const route of ["/history", "/calendar"]) {
    const result = await lighthouse(`${baseUrl}${route}`, {
      port: chrome.port,
      logLevel: "error",
      output: "json",
      onlyCategories: Object.keys(minimumScores),
    });
    const scores = Object.fromEntries(Object.entries(result.lhr.categories).map(([key, category]) => [key, category.score]));
    process.stdout.write(`${route}: ${Object.entries(scores).map(([key, score]) => `${key} ${Math.round(score * 100)}`).join(", ")}\n`);
    for (const [category, minimum] of Object.entries(minimumScores)) {
      if ((scores[category] ?? 0) < minimum) {
        failed = true;
        process.stderr.write(`${route}: ${category} must be at least ${Math.round(minimum * 100)} (received ${Math.round((scores[category] ?? 0) * 100)})\n`);
      }
    }
  }
  if (failed) process.exitCode = 1;
} finally {
  if (chrome) await chrome.kill();
  preview.kill("SIGTERM");
  await rm(chromeProfile, { recursive: true, force: true });
}
