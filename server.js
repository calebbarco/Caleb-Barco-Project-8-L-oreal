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

const { LOREAL_SYSTEM_PROMPT, getFallbackAdvisorReply } = globalThis.LorealAdvisor;

const app = express();
app.use(express.json({ limit: "1mb" }));

// Server-side OpenAI proxy endpoint: keeps the API key off the client
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

  const apiKey = (process.env.OPENAI_API_KEY || "").trim();

  // If OPENAI_API_KEY is not configured in the environment, return curated local advisor guidance
  if (!apiKey) {
    const lastUserMessage =
      [...sanitizedMessages].reverse().find((m) => m.role === "user")?.content || "";
    return res.json({
      source: "local-fallback",
      choices: [
        {
          message: {
            role: "assistant",
            content: getFallbackAdvisorReply(lastUserMessage),
          },
        },
      ],
    });
  }

  try {
    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: sanitizedMessages,
        max_completion_tokens: 450,
      }),
    });

    const data = await openAiResponse.json();

    if (!openAiResponse.ok) {
      const errorMessage =
        data?.error?.message || `OpenAI API returned status ${openAiResponse.status}`;
      console.error("OpenAI proxy error:", openAiResponse.status);
      return res.status(openAiResponse.status).json({ error: errorMessage });
    }

    return res.json(data);
  } catch (error) {
    console.error("OpenAI proxy network failure:", error.message);
    return res.status(502).json({
      error: "Unable to reach the OpenAI service right now. Please try again shortly.",
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
