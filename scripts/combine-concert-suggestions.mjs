import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { normalize } from "./lib/suggestion-scraper-utils.mjs";

function slug(value) {
  return normalize(value).replaceAll(" ", "-");
}

const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
const outputPath = outputArgument?.slice("--output=".length) || "data/suggestions.json";
const inputPaths = process.argv.slice(2).filter((argument) => !argument.startsWith("--output="));

if (!inputPaths.length) {
  throw new Error("Pass at least one scraper result file");
}

const combined = [];
const seen = new Set();
for (const inputPath of inputPaths) {
  const result = JSON.parse(await fs.readFile(path.resolve(inputPath), "utf8"));
  for (const suggestion of result.suggestions || []) {
    const artists = suggestion.artists || (suggestion.artist ? [suggestion.artist] : []);
    for (const artist of artists) {
      const key = `${normalize(artist)}|${suggestion.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push({
        id: result.preserved ? suggestion.id : `${suggestion.id}-${slug(artist)}`,
        artist,
        venue: suggestion.venue || "",
        city: suggestion.city || "",
        country: suggestion.country || "ES",
        date: suggestion.date,
        title: suggestion.title || artist,
        source: suggestion.source,
        sourceUrl: suggestion.sourceUrl,
      });
    }
  }
}

combined.sort((left, right) => {
  const [leftDay, leftMonth, leftYear] = left.date.split("/").map(Number);
  const [rightDay, rightMonth, rightYear] = right.date.split("/").map(Number);
  return new Date(leftYear, leftMonth - 1, leftDay) - new Date(rightYear, rightMonth - 1, rightDay)
    || left.artist.localeCompare(right.artist);
});

let generatedAt = new Date().toISOString();
try {
  const current = JSON.parse(await fs.readFile(path.resolve(outputPath), "utf8"));
  if (JSON.stringify(current.suggestions || []) === JSON.stringify(combined)) generatedAt = current.generatedAt || generatedAt;
} catch {
  // The first run creates the output file.
}

const output = `${JSON.stringify({ generatedAt, suggestions: combined }, null, 2)}\n`;
await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await fs.writeFile(path.resolve(outputPath), output, "utf8");
process.stdout.write(`Wrote ${combined.length} suggestions to ${outputPath}\n`);
