import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { getAdminProviderStatus } from "./netlify/functions/admin-provider-status.js";
import { searchExternalConcertCatalog } from "./netlify/functions/lib/concert-catalog-providers.js";

const jsonResponse = (response, status, body) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(typeof body === "string" ? body : JSON.stringify(body));
};

const readJsonBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

function localNetlifyFunctions(env) {
  let suggestionRefresh = { status: "idle", conclusion: null };
  return {
    name: "local-netlify-functions",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/.netlify/functions/search-concert-catalog", async (request, response) => {
        if (request.method !== "POST") return jsonResponse(response, 405, "Method not allowed");
        try {
          return jsonResponse(response, 200, { concerts: await searchExternalConcertCatalog(await readJsonBody(request), env) });
        } catch (error) {
          return jsonResponse(response, 400, { error: error.message });
        }
      });

      server.middlewares.use("/.netlify/functions/refresh-suggestions", async (request, response) => {
        if (request.method !== "POST") return jsonResponse(response, 405, "Method not allowed");
        if (["queued", "in_progress"].includes(suggestionRefresh.status)) {
          return jsonResponse(response, 200, { ok: true, alreadyRunning: true, status: suggestionRefresh.status });
        }
        suggestionRefresh = { status: "queued", conclusion: null };
        const child = spawn(process.execPath, ["scripts/refresh-concert-suggestions.mjs"], {
          cwd: server.config.root,
          stdio: "inherit",
        });
        suggestionRefresh = { status: "in_progress", conclusion: null };
        child.on("error", () => { suggestionRefresh = { status: "completed", conclusion: "failure" }; });
        child.on("exit", (code) => { suggestionRefresh = { status: "completed", conclusion: code === 0 ? "success" : "failure" }; });
        return jsonResponse(response, 202, { ok: true, status: "in_progress", local: true });
      });

      server.middlewares.use("/.netlify/functions/suggestion-refresh-status", async (request, response) => {
        if (request.method !== "POST") return jsonResponse(response, 405, "Method not allowed");
        return jsonResponse(response, 200, suggestionRefresh);
      });

      server.middlewares.use("/.netlify/functions/admin-provider-status", async (request, response) => {
        if (request.method !== "POST") return jsonResponse(response, 405, "Method not allowed");
        try { return jsonResponse(response, 200, await getAdminProviderStatus(env)); }
        catch (error) { return jsonResponse(response, 500, { error: error.message }); }
      });

      server.middlewares.use("/.netlify/functions/save-concerts", async (request, response) => {
        if (request.method !== "POST") return jsonResponse(response, 405, "Method not allowed");

        try {
          const body = await readJsonBody(request);
          if (!body.data || typeof body.data !== "object") {
            return jsonResponse(response, 400, "Missing or invalid `data`");
          }

          const dataFile = path.resolve(server.config.root, "data/concerts.json");
          await fs.writeFile(dataFile, `${JSON.stringify(body.data, null, 2)}\n`, "utf8");
          return jsonResponse(response, 200, { ok: true, local: true });
        } catch (error) {
          return jsonResponse(response, 500, { error: error.message });
        }
      });

      server.middlewares.use("/.netlify/functions/get-setlist", async (request, response) => {
        if (request.method !== "POST") return jsonResponse(response, 405, "Method not allowed");
        if (!env.SETLIST_API_KEY) {
          return jsonResponse(response, 503, {
            error: "SETLIST_API_KEY is missing. Add it to .env.local and restart the dev server.",
          });
        }

        try {
          const { setlistId, artist, date, action, userId, pages } = await readJsonBody(request);
          if (action === "attended") {
            if (!userId || !/^[\w.-]{1,100}$/.test(userId)) return jsonResponse(response, 400, { error: "Enter a valid setlist.fm username" });
            const setlists = []; const pageLimit = Math.min(Math.max(Number(pages) || 5, 1), 10);
            for (let page = 1; page <= pageLimit; page += 1) {
              const apiResponse = await fetch(`https://api.setlist.fm/rest/1.0/user/${encodeURIComponent(userId)}/attended?p=${page}`, { headers: { "x-api-key": env.SETLIST_API_KEY, Accept: "application/json" } });
              const result = await apiResponse.json(); if (!apiResponse.ok) return jsonResponse(response, apiResponse.status, result);
              setlists.push(...(result.setlist || [])); if (setlists.length >= Number(result.total || 0)) break;
            }
            return jsonResponse(response, 200, { setlist: setlists });
          }
          let apiUrl;
          if (setlistId) {
            apiUrl = `https://api.setlist.fm/rest/1.0/setlist/${encodeURIComponent(setlistId)}`;
          } else if (artist && date) {
            const fmDate = String(date).replace(/\//g, "-");
            apiUrl = `https://api.setlist.fm/rest/1.0/search/setlists?artistName=${encodeURIComponent(artist)}&date=${encodeURIComponent(fmDate)}&p=1`;
          } else {
            return jsonResponse(response, 400, { error: "Provide either setlistId or both artist and date" });
          }

          const apiResponse = await fetch(apiUrl, {
            headers: { "x-api-key": env.SETLIST_API_KEY, Accept: "application/json" },
          });
          const responseText = await apiResponse.text();
          let result;
          try {
            result = JSON.parse(responseText);
          } catch {
            result = { error: responseText || `setlist.fm returned ${apiResponse.status}` };
          }
          if (!apiResponse.ok) return jsonResponse(response, apiResponse.status, result);

          if (!setlistId) {
            const match = result?.setlist?.[0];
            if (!match) return jsonResponse(response, 404, { error: `No setlist found for ${artist} on ${date}` });
            return jsonResponse(response, 200, match);
          }
          return jsonResponse(response, 200, result);
        } catch (error) {
          return jsonResponse(response, 500, { error: error.message });
        }
      });

    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), localNetlifyFunctions(env)],
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/@supabase/")) return "supabase";
          },
        },
      },
    }
  };
});
