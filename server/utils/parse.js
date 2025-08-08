export function safeParseModelJson(text) {
  if (!text || typeof text !== "string") return { error: "empty" };

  const trimmed = text.trim();

  const tryParse = (t) => {
    try { return JSON.parse(t); } catch { return null; }
  };

  // 1) direct JSON
  let obj = tryParse(trimmed);
  if (obj) return obj;

  // 2) extract fenced code block with json
  const fence = /```(?:json)?\n([\s\S]*?)```/i;
  const m = trimmed.match(fence);
  if (m && m[1]) {
    obj = tryParse(m[1]);
    if (obj) return obj;
  }

  // 3) extract first {...} top-level JSON-ish
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    obj = tryParse(trimmed.slice(start, end + 1));
    if (obj) return obj;
  }

  return { error: "Could not parse model output as JSON", raw: text };
} 