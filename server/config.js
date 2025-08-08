import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let secrets = {};
try {
  const secretsPath = path.join(__dirname, "config.secrets.json");
  if (fs.existsSync(secretsPath)) {
    secrets = JSON.parse(fs.readFileSync(secretsPath, "utf-8"));
  }
} catch {}

export default {
  app: {
    port: parseInt(process.env.PORT || "3020", 10)
  },
  i18n: {
    // BCP-47 language code for output text. Default: Traditional Chinese
    language: process.env.TAG_LANGUAGE || "zh-Hant",
    // Hint text for UI
    languageLabel: process.env.TAG_LANGUAGE_LABEL || "Traditional Chinese"
  },
  frameExtraction: {
    defaultNumFrames: parseInt(process.env.DEFAULT_NUM_FRAMES || "8", 10),
    outputWidth: parseInt(process.env.OUTPUT_WIDTH || "768", 10),
    jpegQuality: parseInt(process.env.JPEG_QUALITY || "2", 10)
  },
  providers: {
    ollama: {
      enabled: process.env.OLLAMA_ENABLED !== "false",
      baseUrl: process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434",
      model: process.env.OLLAMA_MODEL || "qwen2.5vl:32b",  // qwen2.5vl:7b or qwen2.5vl:32b
      requestTimeoutMs: parseInt(process.env.OLLAMA_TIMEOUT_MS || "900000", 10)
    },
    openrouter: {
      enabled: process.env.OPENROUTER_ENABLED !== "false",
      baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      model: process.env.OPENROUTER_MODEL || "qwen/qwen2.5-vl-72b-instruct:free",
      requestTimeoutMs: parseInt(process.env.OPENROUTER_TIMEOUT_MS || "900000", 10),
      // Priority: ENV > secrets file > empty
      apiKey: process.env.OPENROUTER_API_KEY || secrets.openrouterApiKey || ""
    }
  }
}; 