import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import config from "../config.js";
import { extractUniformFrames } from "../services/frameExtractor.js";
import axios from "axios";
import { analyzeWithOllama } from "../services/ollamaClient.js";
import { analyzeWithOpenRouter } from "../services/openrouterClient.js";
import { safeParseModelJson } from "../utils/parse.js";

const router = express.Router();

const uploadsDir = path.resolve("tmp", "uploads");
const framesDir = path.resolve("tmp", "frames");

for (const dir of [uploadsDir, framesDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || ".mp4";
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({ storage });

// In-memory task registry for abort
const tasks = new Map(); // sessionId -> cancel token/source

router.post("/analyze", upload.single("video"), async (req, res) => {
  const provider = (req.body.provider || "ollama").toLowerCase();
  const numFrames = parseInt(req.body.numFrames || config.frameExtraction.defaultNumFrames, 10);

  if (!req.file) {
    return res.status(400).json({ error: "No video file uploaded" });
  }

  const inputVideoPath = req.file.path;
  const providedSessionId = (req.body.sessionId ? String(req.body.sessionId) : "").trim();
  const sessionId = providedSessionId || uuidv4();
  const sessionFramesDir = path.join(framesDir, sessionId);
  fs.mkdirSync(sessionFramesDir, { recursive: true });

  try {
    const abortController = new AbortController();
    tasks.set(sessionId, abortController);
    const { frames, timestamps } = await extractUniformFrames({
      inputFilePath: inputVideoPath,
      outputDirPath: sessionFramesDir,
      numFrames,
      outputWidth: config.frameExtraction.outputWidth,
      jpegQuality: config.frameExtraction.jpegQuality
    });

    const imagesBase64 = frames.map((f) => f.base64Data);

    const systemInstruction = `You are a media archivist assisting investigative journalists. Create search-friendly, concise tags. Use ${config.i18n.languageLabel} for ALL text fields (captions, tags, people, organizations, locations, objects, actions, topics, summary, OCR text). Keep JSON keys in English.`;
    const userInstruction = `Analyze the following ${imagesBase64.length} keyframes from a video and produce STRICT JSON ONLY with the schema below. Do not include any prose or code fences. Keep the response compact, high-signal, and directly useful for newsroom search.

{
  "frames": [
    { "index": number, "timestampSec": number, "caption": string, "tags": string[], "people": string[], "objects": string[], "actions": string[], "text": string }
  ],
  "overall": {
    "summary": string,
    "topics": string[],
    "people": string[],
    "organizations": string[],
    "locations": string[],
    "objects": string[],
    "actions": string[]
  }
}

Requirements:
- Language: ${config.i18n.languageLabel} (all text values)
- Audience: journalists conducting media archive search
- Be concise, avoid repetition, maximize retrieval quality
- OCR any visible on-screen text into the "text" field
- Use neutral, factual wording
- IMPORTANT: Return exactly ${imagesBase64.length} items in the frames array, one for each provided keyframe image, in the SAME order as given. Set index to 0..${imagesBase64.length - 1} to match that order. Do NOT reorder, skip, or duplicate frames.`;

    let modelRawText;
    if (provider === "openrouter") {
      if (!config.providers.openrouter.enabled) {
        throw new Error("OpenRouter provider is disabled in config");
      }
      modelRawText = await analyzeWithOpenRouter({
        imagesBase64,
        systemInstruction,
        userInstruction,
        model: config.providers.openrouter.model,
        signal: abortController.signal
      });
    } else {
      if (!config.providers.ollama.enabled) {
        throw new Error("Ollama provider is disabled in config");
      }
      // First, run a multi-image pass to get overall summary/topics, etc.
      modelRawText = await analyzeWithOllama({
        imagesBase64,
        prompt: `${systemInstruction}\n\n${userInstruction}`,
        model: config.providers.ollama.model,
        signal: abortController.signal
      });
    }

    const parsed = safeParseModelJson(modelRawText);

    // Normalize per-frame analysis to align with extracted frames order
    const num = frames.length;
    let parsedFrames = Array.isArray(parsed?.frames) ? parsed.frames : [];

    function toArray(value) {
      if (Array.isArray(value)) return value;
      if (value == null) return [];
      return [String(value)];
    }

    let aligned = [];
    if (provider === "ollama") {
      // For local Ollama, do per-frame calls to guarantee 1:1 mapping
      aligned = new Array(num).fill(null);
      for (let i = 0; i < num; i += 1) {
        const singlePrompt = `${systemInstruction}\n\nYou will analyze ONE keyframe only and return STRICT JSON ONLY with this schema (no prose):\n{\n  "caption": string,\n  "tags": string[],\n  "people": string[],\n  "objects": string[],\n  "actions": string[],\n  "text": string\n}`;
        try {
          const one = await analyzeWithOllama({
            imagesBase64: [imagesBase64[i]],
            prompt: singlePrompt,
            model: config.providers.ollama.model,
            signal: abortController.signal
          });
          const parsedOne = safeParseModelJson(one);
          aligned[i] = parsedOne || {};
        } catch (e) {
          aligned[i] = {};
        }
      }
    } else if (parsedFrames.length === num) {
      // Trust order when counts match for non-Ollama providers
      aligned = parsedFrames.slice(0, num);
    } else {
      // Try index-based mapping if indices look sane
      aligned = new Array(num).fill(null);
      const hasNumericIndex = parsedFrames.every((pf) => pf && Number.isFinite(pf.index));
      if (hasNumericIndex && parsedFrames.length > 0) {
        const indices = parsedFrames.map((pf) => Number(pf.index));
        const minIdx = Math.min(...indices);
        const maxIdx = Math.max(...indices);
        const isOneBasedContiguous = minIdx === 1 && maxIdx === num;
        for (const pf of parsedFrames) {
          let idx0 = Number(pf.index);
          if (isOneBasedContiguous) idx0 -= 1;
          if (idx0 >= 0 && idx0 < num && aligned[idx0] === null) {
            aligned[idx0] = pf;
          }
        }
      }
      // Fill remaining slots by original order
      if (aligned.some((x) => x === null)) {
        let j = 0;
        for (let i = 0; i < num; i += 1) {
          if (aligned[i] === null) {
            while (j < parsedFrames.length && parsedFrames[j] == null) j += 1;
            aligned[i] = parsedFrames[j] || {};
            j += 1;
          }
        }
      }
    }

    const normalizedFrames = aligned.map((pf, i) => ({
      index: i,
      timestampSec: timestamps[i],
      caption: typeof pf?.caption === "string" ? pf.caption : "",
      tags: toArray(pf?.tags).map(String),
      people: toArray(pf?.people).map(String),
      organizations: toArray(pf?.organizations).map(String),
      locations: toArray(pf?.locations).map(String),
      objects: toArray(pf?.objects).map(String),
      actions: toArray(pf?.actions).map(String),
      text: typeof pf?.text === "string" ? pf.text : ""
    }));

    const responseAnalysis = { ...parsed, frames: normalizedFrames };

    res.json({
      provider,
      model: provider === "openrouter" ? config.providers.openrouter.model : config.providers.ollama.model,
      frames: frames.map((f, idx) => ({
        index: idx,
        timestampSec: timestamps[idx],
        base64: f.base64Data,
        fileName: f.fileName
      })),
      analysis: responseAnalysis
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || String(err) });
  } finally {
    tasks.delete(sessionId);
    // Cleanup
    try { fs.unlinkSync(inputVideoPath); } catch {}
    try { fs.rmSync(sessionFramesDir, { recursive: true, force: true }); } catch {}
  }
});

// Abort endpoint: clients can call to cancel a running analyze
router.post("/abort", (req, res) => {
  const id = String(req.body?.sessionId || "").trim();
  if (!id) return res.status(400).json({ error: "Missing sessionId" });
  const controller = tasks.get(id);
  if (controller && typeof controller.abort === "function") {
    try { controller.abort(); } catch {}
    tasks.delete(id);
    return res.json({ ok: true, aborted: true });
  }
  return res.json({ ok: true, aborted: false });
});

export default router; 