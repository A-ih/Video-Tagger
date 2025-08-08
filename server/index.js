import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import config from "./config.js";
import analyzeRouter from "./routes/analyze.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

// Serve the frontend
app.use(express.static(path.join(__dirname, "..", "public")));

// Healthcheck
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// Expose minimal runtime config to the UI
app.get("/api/config", (req, res) => {
  res.json({
    providers: {
      ollama: { model: config.providers.ollama.model },
      openrouter: { model: config.providers.openrouter.model }
    }
  });
});

// List available local Ollama models
app.get("/api/ollama/models", async (req, res) => {
  try {
    const base = config.providers.ollama.baseUrl;
    // Try /api/tags first (common), then fallback to /api/models
    let names = [];
    try {
      const { data } = await axios.get(`${base}/api/tags`, { timeout: 5000 });
      const models = Array.isArray(data?.models) ? data.models : [];
      names = models.map((m) => m.name).filter(Boolean);
    } catch {
      const { data } = await axios.get(`${base}/api/models`, { timeout: 5000 });
      const models = Array.isArray(data?.models) ? data.models : [];
      names = models.map((m) => m.name).filter(Boolean);
    }
    res.json({ models: names });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Set the active Ollama model (in-memory, affects subsequent requests)
app.post("/api/ollama/model", (req, res) => {
  const model = (req.body && req.body.model ? String(req.body.model) : "").trim();
  if (!model) {
    return res.status(400).json({ error: "Missing 'model' in body" });
  }
  config.providers.ollama.model = model;
  res.json({ ok: true, model });
});

// API routes
app.use("/api", analyzeRouter);

// Fallback to index.html for root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(config.app.port, () => {
  console.log(`video-tagger listening on http://localhost:${config.app.port}`);
}); 