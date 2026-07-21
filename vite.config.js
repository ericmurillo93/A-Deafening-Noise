import fs from "node:fs/promises";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

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
  return {
    name: "local-netlify-functions",
    apply: "serve",
    configureServer(server) {
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
          const { setlistId, artist, date } = await readJsonBody(request);
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
      sourcemap: false
    }
  };
});
