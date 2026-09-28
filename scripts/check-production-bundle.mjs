import assert from "node:assert/strict";
import fs from "node:fs/promises";
const files = await fs.readdir("dist/assets");
const javascript = (await Promise.all(files.filter((file) => file.endsWith(".js")).map((file) => fs.readFile(`dist/assets/${file}`, "utf8")))).join("\n");
const privateData = JSON.parse(await fs.readFile("data/concerts.json", "utf8"));
const names = new Set(privateData.concerts.flatMap((concert) => [...(concert.attendees || []), ...(concert.guestAttendees || [])]).filter((name) => typeof name === "string" && name.length >= 5));
for (const name of names) assert(!javascript.includes(JSON.stringify(name)), "A private fallback attendee was found in the hosted bundle");
assert(!(await fs.readFile("dist/index.html", "utf8")).includes("<script>"), "Inline scripts violate the production CSP");
console.log("Hosted bundle excludes fallback attendees and inline scripts.");
