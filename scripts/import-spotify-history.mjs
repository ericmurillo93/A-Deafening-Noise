import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { normalize } from "./lib/suggestion-scraper-utils.mjs";

const inputPath = path.resolve(process.argv.slice(2).find((argument) => !argument.startsWith("--")) || "my_spotify_data.zip");
const outputPath = path.resolve(
  process.argv.find((argument) => argument.startsWith("--output="))?.slice("--output=".length)
    || "data/listened-artists.json",
);

async function findAudioFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findAudioFiles(entryPath));
    else if (/^Streaming_History_Audio_[^/]*\.json$/i.test(entry.name)) files.push(entryPath);
  }
  return files;
}

async function prepareInput() {
  const input = await fs.stat(inputPath);
  if (input.isDirectory()) return { directory: inputPath, temporary: false };

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "adn-spotify-"));
  const command = process.platform === "win32" ? "powershell.exe" : "unzip";
  const args = process.platform === "win32"
    ? ["-NoProfile", "-Command", "Expand-Archive", "-LiteralPath", inputPath, "-DestinationPath", directory, "-Force"]
    : ["-qq", inputPath, "-d", directory];
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error?.code === "ENOENT") {
    await fs.rm(directory, { recursive: true, force: true });
    throw new Error(`${command} is required to read the Spotify ZIP; extract it manually and pass the directory instead`);
  }
  if (result.status !== 0) {
    await fs.rm(directory, { recursive: true, force: true });
    throw new Error(`Could not extract ${path.basename(inputPath)} (exit ${result.status})`);
  }
  return { directory, temporary: true };
}

const preparedInput = await prepareInput();
let cleanupTemporaryInput = preparedInput.temporary;
process.on("exit", () => {
  if (cleanupTemporaryInput) fsSync.rmSync(preparedInput.directory, { recursive: true, force: true });
});
const audioFiles = (await findAudioFiles(preparedInput.directory)).sort((left, right) => left.localeCompare(right));

if (!audioFiles.length) throw new Error("No Spotify Extended Streaming History audio JSON files were found");

const artists = new Map();
let recordsProcessed = 0;
let qualifyingListens = 0;

for (const filename of audioFiles) {
  let records;
  try {
    records = JSON.parse(await fs.readFile(filename, "utf8"));
  } catch (error) {
    throw new Error(`Could not parse ${filename}: ${error.message}`);
  }
  if (!Array.isArray(records)) throw new Error(`${filename} does not contain a JSON array`);

  for (const record of records) {
    recordsProcessed += 1;
    const artist = String(record.master_metadata_album_artist_name || "").trim();
    const milliseconds = Number(record.ms_played) || 0;
    const key = normalize(artist);
    if (!key || milliseconds <= 0) continue;
    qualifyingListens += 1;

    const timestamp = typeof record.ts === "string" ? record.ts : "";
    const current = artists.get(key) || {
      names: new Map(),
      listenCount: 0,
      totalMsPlayed: 0,
      firstListenedAt: timestamp,
      lastListenedAt: timestamp,
    };
    current.names.set(artist, (current.names.get(artist) || 0) + 1);
    current.listenCount += 1;
    current.totalMsPlayed += milliseconds;
    if (timestamp && (!current.firstListenedAt || timestamp < current.firstListenedAt)) current.firstListenedAt = timestamp;
    if (timestamp && (!current.lastListenedAt || timestamp > current.lastListenedAt)) current.lastListenedAt = timestamp;
    artists.set(key, current);
  }
}

const artistRows = [...artists.values()]
  .map(({ names, ...artist }) => ({
    artist: [...names].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0][0],
    ...artist,
  }))
  .sort((left, right) => left.artist.localeCompare(right.artist));

const catalog = {
  generatedAt: new Date().toISOString(),
  source: "Spotify Extended Streaming History",
  matchingRule: "At least one audio record with ms_played greater than zero",
  filesProcessed: audioFiles.length,
  recordsProcessed,
  qualifyingListens,
  artists: artistRows,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
if (preparedInput.temporary) {
  await fs.rm(preparedInput.directory, { recursive: true, force: true });
  cleanupTemporaryInput = false;
}
process.stdout.write(`Imported ${artistRows.length} listened artists from ${qualifyingListens} audio records.\n`);
process.stdout.write(`Wrote privacy-reduced catalog to ${path.relative(process.cwd(), outputPath) || outputPath}.\n`);
