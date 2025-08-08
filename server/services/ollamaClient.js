import axios from "axios";
import config from "../config.js";

export async function analyzeWithOllama({ imagesBase64, prompt, model, signal }) {
  const url = `${config.providers.ollama.baseUrl}/api/generate`;

  const body = {
    model: model || config.providers.ollama.model,
    prompt,
    images: imagesBase64,
    stream: false
  };

  const { data } = await axios.post(url, body, { timeout: config.providers.ollama.requestTimeoutMs, signal });
  // Ollama returns { response: string, ... }
  return (data && data.response) ? data.response : JSON.stringify(data || {});
} 