import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "adn-suggestions-"));
const scrapers = [
  ["resurrection", "scrape-resurrection-route.mjs", "Resurrection Fest Route"],
  ["livenation", "scrape-livenation-events.mjs", "Live Nation Spain"],
  ["madness", "scrape-madness-live.mjs", "Madness Live"],
  ["razzmatazz", "scrape-razzmatazz.mjs", "Sala Razzmatazz"],
  ["parallel62", "scrape-parallel62.mjs", "Paral·lel 62"],
  ["palau", "scrape-palau-musica.mjs", "Palau de la Música Catalana"],
  ["docks", "scrape-docks.mjs", "Les Docks"],
  ["montreux", "scrape-montreux-jazz-festival.mjs", "Montreux Jazz Festival"],
  ["apolo", "scrape-sala-apolo.mjs", "Sala Apolo"],
  ["bikini", "scrape-bikini-barcelona.mjs", "Sala Bikini"],
  ["dice", "scrape-dice.mjs", "DICE"],
  ["doctor-music", "scrape-doctor-music.mjs", "Doctor Music"],
];

function run(script, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", script), ...arguments_], { cwd: root, stdio: "inherit" });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`)));
  });
}

try {
  let previousSuggestions = [];
  try {
    previousSuggestions = JSON.parse(await fs.readFile(path.join(root, "data/suggestions.json"), "utf8")).suggestions || [];
  } catch {
    // A first run has no results to preserve when a source is unavailable.
  }
  const outputs = [];
  for (const [name, script, source] of scrapers) {
    const output = path.join(temp, `${name}.json`);
    try {
      await run(script, [`--output=${output}`]);
    } catch (error) {
      const preserved = previousSuggestions.filter((item) => item.source === source);
      await fs.writeFile(output, `${JSON.stringify({ source, preserved: true, suggestions: preserved }, null, 2)}\n`, "utf8");
      process.stderr.write(`Warning: ${source} could not be refreshed; preserving ${preserved.length} previous suggestions. ${error.message}\n`);
    }
    outputs.push(output);
  }
  await run("combine-concert-suggestions.mjs", [...outputs, "--output=data/suggestions.json"]);
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
