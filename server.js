/*
 * server.js
 * Secure server-side proxy for the L'Oréal Smart Product Advisor.
 * Keeps OPENAI_API_KEY strictly on the server (never exposed to browser JS)
 * and serves the Vite frontend on port 3000.
 */

import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./advisor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const CLOUDFLARE_WORKER_URL = "https://loreal-worker.cbarco21.workers.dev/";
const { LOREAL_SYSTEM_PROMPT } = globalThis.LorealAdvisor;

const app = express();
app.use(express.json({ limit: "1mb" }));

// Forward any /api/chat requests through the deployed Cloudflare Worker
app.post("/api/chat", async (req, res) => {
  const { messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "A non-empty messages array is required." });
  }

  const conversationTurns = messages
    .filter(
      (msg) =>
        msg &&
        (msg.role === "user" || msg.role === "assistant") &&
        typeof msg.content === "string" &&
        msg.content.trim().length > 0
    )
    .map((msg) => ({
      role: msg.role,
      content: msg.content.trim(),
    }));

  if (conversationTurns.length === 0) {
    return res.status(400).json({ error: "No valid chat messages provided." });
  }

  // Always enforce the server-controlled L'Oréal-only system prompt
  const sanitizedMessages = [
    { role: "system", content: LOREAL_SYSTEM_PROMPT },
    ...conversationTurns,
  ];

  try {
    const workerResponse = await fetch(CLOUDFLARE_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: sanitizedMessages,
      }),
    });

    const data = await workerResponse.json();
    return res.status(workerResponse.status).json(data);
  } catch (error) {
    console.error("Cloudflare Worker proxy error:", error.message);
    return res.status(502).json({
      error: "Unable to reach the Cloudflare Worker right now. Please try again shortly.",
    });
  }
});

async function startServer() {
  if (IS_PRODUCTION) {
    const distDir = path.join(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, HOST, () => {
    console.log(`L'Oréal Smart Product Advisor running at http://${HOST}:${PORT}`);
  });
}

startServer();
