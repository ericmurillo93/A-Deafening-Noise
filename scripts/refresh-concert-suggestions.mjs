import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "adn-suggestions-"));
const scrapers = [
  ["resurrection", "scrape-resurrection-route.mjs"],
  ["livenation", "scrape-livenation-events.mjs"],
  ["madness", "scrape-madness-live.mjs"],
  ["razzmatazz", "scrape-razzmatazz.mjs"],
  ["parallel62", "scrape-parallel62.mjs"],
  ["palau", "scrape-palau-musica.mjs"],
  ["docks", "scrape-docks.mjs"],
  ["montreux", "scrape-montreux-jazz-festival.mjs"],
  ["apolo", "scrape-sala-apolo.mjs"],
  ["bikini", "scrape-bikini-barcelona.mjs"],
];

function run(script, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", script), ...arguments_], { cwd: root, stdio: "inherit" });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`)));
  });
}

try {
  const outputs = [];
  for (const [name, script] of scrapers) {
    const output = path.join(temp, `${name}.json`);
    await run(script, [`--output=${output}`]);
    outputs.push(output);
  }
  await run("combine-concert-suggestions.mjs", [...outputs, "--output=data/suggestions.json"]);
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
