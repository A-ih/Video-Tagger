import axios from "axios";
import config from "../config.js";

export async function analyzeWithOpenRouter({ imagesBase64, systemInstruction, userInstruction, model, signal }) {
  if (!config.providers.openrouter.apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY in environment");
  }

  const url = `${config.providers.openrouter.baseUrl}/chat/completions`;

  const content = [
    { type: "text", text: userInstruction },
    ...imagesBase64.map((b64) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }))
  ];

  const body = {
    model: model || config.providers.openrouter.model,
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content }
    ],
    temperature: 0.2
  };

  const headers = {
    Authorization: `Bearer ${config.providers.openrouter.apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://example.com",
    "X-Title": "video-tagger"
  };

  const { data } = await axios.post(url, body, { headers, timeout: config.providers.openrouter.requestTimeoutMs, signal });
  const text = data?.choices?.[0]?.message?.content || "";
  return text;
} 