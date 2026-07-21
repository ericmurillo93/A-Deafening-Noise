import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const withAuth = process.argv.includes("--auth");
const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const npxCommand = isWindows ? "npx.cmd" : "npx";
const ghCommand = isWindows ? "gh.exe" : "gh";

function run(command, args, { required = true } = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error?.code === "ENOENT") {
    if (required) throw new Error(`${command} is not installed or is not available on PATH`);
    return false;
  }
  if (result.status !== 0 && required) {
    throw new Error(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }
  return result.status === 0;
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 24) {
  throw new Error(`Node.js 24 or newer is required; current version is ${process.version}. If you use nvm, run: nvm install && nvm use`);
}

if (!fs.existsSync(path.join(root, "package.json")) || !fs.existsSync(path.join(root, ".git"))) {
  throw new Error("Run this command from the root of a cloned A-Deafening-Noise repository");
}

process.stdout.write("\nInstalling locked project dependencies...\n");
run(npmCommand, ["ci"]);

const envExample = path.join(root, ".env.example");
const envLocal = path.join(root, ".env.local");
if (!fs.existsSync(envLocal)) {
  fs.copyFileSync(envExample, envLocal, fs.constants.COPYFILE_EXCL);
  process.stdout.write("Created .env.local from .env.example. Add SETLIST_API_KEY there if setlist lookup is needed.\n");
} else {
  process.stdout.write("Preserved the existing .env.local.\n");
}

if (withAuth) {
  process.stdout.write("\nChecking GitHub authentication...\n");
  const ghInstalled = run(ghCommand, ["--version"], { required: false });
  if (ghInstalled) {
    if (!run(ghCommand, ["auth", "status"], { required: false })) run(ghCommand, ["auth", "login"]);
    run(ghCommand, ["auth", "setup-git"]);
  } else {
    process.stdout.write("GitHub CLI is not installed. Install it later if this user needs to push changes.\n");
  }

  process.stdout.write("\nChecking Codex authentication...\n");
  const codexArgs = ["--yes", "@openai/codex"];
  if (!run(npxCommand, [...codexArgs, "login", "status"], { required: false })) {
    run(npxCommand, [...codexArgs, "login"]);
  }
}

process.stdout.write("\nSetup complete.\n");
process.stdout.write("Start the site: npm run dev\n");
process.stdout.write("Start Codex:   npm run codex\n\n");
