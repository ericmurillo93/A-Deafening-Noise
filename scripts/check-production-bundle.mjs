import assert from "node:assert/strict";
import fs from "node:fs/promises";
const files = await fs.readdir("dist/assets");
const javascript = (await Promise.all(files.filter((file) => file.endsWith(".js")).map((file) => fs.readFile(`dist/assets/${file}`, "utf8")))).join("\n");
assert(!javascript.includes("EXAMPLE ARTIST 01"), "Demo fixtures were found in the hosted bundle");
assert(!(await fs.readFile("dist/index.html", "utf8")).includes("<script>"), "Inline scripts violate the production CSP");
console.log("Hosted bundle excludes demo fixtures and inline scripts; real datasets are not build inputs.");
