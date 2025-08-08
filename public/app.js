let provider = "ollama";
let runtimeConfig = {
  providers: {
    ollama: { model: "qwen2.5vl:7b" },
    openrouter: { model: "qwen/qwen2.5-vl-72b-instruct:free" }
  }
};

async function loadRuntimeConfig() {
  try {
    const resp = await fetch("/api/config");
    if (resp.ok) {
      const cfg = await resp.json();
      if (cfg && cfg.providers) runtimeConfig = cfg;
    }
  } catch {}
}

async function loadOllamaModels() {
  try {
    const resp = await fetch("/api/ollama/models");
    if (!resp.ok) return;
    const data = await resp.json();
    const models = Array.isArray(data.models) ? data.models : [];
    if (!ollamaModelSelect) return;
    ollamaModelSelect.innerHTML = "";
    for (const name of models) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (name === runtimeConfig.providers.ollama.model) opt.selected = true;
      ollamaModelSelect.appendChild(opt);
    }
  } catch {}
}

const btnOllama = document.getElementById("btn-ollama");
const btnOpenRouter = document.getElementById("btn-openrouter");
const modelHint = document.getElementById("model-hint");
const ollamaModelSelect = document.getElementById("ollama-model-select");
const ollamaModelApply = document.getElementById("ollama-model-apply");
const numFramesEl = document.getElementById("numFrames");
const fileEl = document.getElementById("video");
const analyzeBtn = document.getElementById("analyzeBtn");
const abortBtn = document.getElementById("abortBtn");
const progressEl = document.getElementById("progress");
const timerEl = document.getElementById("timer");
const framesEl = document.getElementById("frames");
const analysisHumanEl = document.getElementById("analysis-human");
const analysisJsonEl = document.getElementById("analysis-json");
const toggleJsonBtn = document.getElementById("toggleJsonBtn");
const copyJsonBtn = document.getElementById("copyJsonBtn");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");

btnOllama.addEventListener("click", () => {
  provider = "ollama";
  btnOllama.classList.add("active");
  btnOpenRouter.classList.remove("active");
  modelHint.textContent = `使用：${runtimeConfig.providers.ollama.model}（Ollama）`;
});

btnOpenRouter.addEventListener("click", () => {
  provider = "openrouter";
  btnOpenRouter.classList.add("active");
  btnOllama.classList.remove("active");
  modelHint.textContent = `使用：${runtimeConfig.providers.openrouter.model}（OpenRouter）`;
});

// Initialize UI model hint on load
(async () => {
  await loadRuntimeConfig();
  await loadOllamaModels();
  modelHint.textContent = `使用：${runtimeConfig.providers.ollama.model}（Ollama）`;
})();

if (ollamaModelApply) {
  ollamaModelApply.addEventListener("click", async () => {
    const selected = ollamaModelSelect && ollamaModelSelect.value;
    if (!selected) return;
    try {
      const resp = await fetch("/api/ollama/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selected })
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.error || `Failed to set model: ${resp.status}`);
      }
      await loadRuntimeConfig();
      modelHint.textContent = `使用：${runtimeConfig.providers.ollama.model}（Ollama）`;
    } catch (e) {
      alert(e.message || String(e));
    }
  });
}

function setProgress(text) {
  progressEl.style.display = text ? "block" : "none";
  progressEl.textContent = text || "";
}

function pretty(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function chipsHtml(items) {
  if (!Array.isArray(items) || items.length === 0) return '<div class="chips"><span class="chip">—</span></div>';
  return `<div class="chips">${items.map((t) => `<span class=\"chip\">${escapeHtml(String(t))}</span>`).join("")}</div>`;
}

function escapeHtml(str) {
  return str.replace(/[&<>"]?/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
}

function renderHumanReadable(data) {
  const a = data.analysis || {};
  const overall = a.overall || {};
  const frames = data.frames || [];

  let html = "";

  // Overall
  html += `<div class="block"><h4>總結</h4><div>${escapeHtml(overall.summary || '—')}</div></div>`;
  html += `<div class="block"><h4>主題</h4>${chipsHtml(overall.topics)}</div>`;
  html += `<div class="block"><h4>人物</h4>${chipsHtml(overall.people)}</div>`;
  html += `<div class="block"><h4>機構 / 團體</h4>${chipsHtml(overall.organizations)}</div>`;
  html += `<div class="block"><h4>地點</h4>${chipsHtml(overall.locations)}</div>`;
  html += `<div class="block"><h4>物件</h4>${chipsHtml(overall.objects)}</div>`;
  html += `<div class="block"><h4>動作</h4>${chipsHtml(overall.actions)}</div>`;

  // Frames
  html += `<div class="block"><h4>逐格重點</h4><div class="stack">`;
  for (const f of frames) {
    const fa = (a.frames && a.frames.find((x) => x.index === f.index)) || {};
    html += `
      <div class="frame-card">
        <div>
          <img src="data:image/jpeg;base64,${f.base64}" alt="frame ${f.index}" />
          <div class="frame-meta">#${f.index} ・ ${f.timestampSec?.toFixed ? f.timestampSec.toFixed(2) : f.timestampSec}s</div>
        </div>
        <div>
          <div class="block"><h4>重點描述</h4><div>${escapeHtml(fa.caption || '—')}</div></div>
          <div class="block"><h4>標籤</h4>${chipsHtml(fa.tags)}</div>
          <div class="block"><h4>人物</h4>${chipsHtml(fa.people)}</div>
          <div class="block"><h4>物件</h4>${chipsHtml(fa.objects)}</div>
          <div class="block"><h4>動作</h4>${chipsHtml(fa.actions)}</div>
          <div class="block"><h4>螢幕文字（OCR）</h4><div>${escapeHtml(fa.text || '—')}</div></div>
        </div>
      </div>`;
  }
  html += `</div></div>`;

  analysisHumanEl.innerHTML = html;
}

let lastJson = null;
let timerHandle = null;
let timerStart = 0;
let currentSessionId = null;

function startTimer() {
  timerStart = Date.now();
  timerEl.style.display = "block";
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = setInterval(() => {
    const secs = Math.floor((Date.now() - timerStart) / 1000);
    timerEl.textContent = `用時：${secs} 秒`;
  }, 1000);
}

function stopTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
  timerEl.style.display = "none";
}

analyzeBtn.addEventListener("click", async () => {
  const file = fileEl.files && fileEl.files[0];
  if (!file) { alert("請選擇影片檔案"); return; }

  const numFrames = parseInt(numFramesEl.value || "8", 10);
  if (!Number.isFinite(numFrames) || numFrames <= 0) { alert("關鍵畫面張數不正確"); return; }

  framesEl.innerHTML = "";
  analysisHumanEl.innerHTML = "";
  analysisJsonEl.textContent = "";

  const fd = new FormData();
  fd.append("video", file);
  fd.append("numFrames", String(numFrames));
  fd.append("provider", provider);
  const sessionId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  currentSessionId = sessionId;
  fd.append("sessionId", sessionId);

  setProgress("上傳與抽幀中...");
  analyzeBtn.disabled = true;
  abortBtn.style.display = "inline-block";

  try {
    startTimer();
    const resp = await fetch("/api/analyze", { method: "POST", body: fd });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Request failed: ${resp.status}`);
    }
    const data = await resp.json();
    currentSessionId = null;

    setProgress("");
    stopTimer();
    abortBtn.style.display = "none";

    // Frames preview
    for (const frame of data.frames) {
      const img = document.createElement("img");
      img.src = `data:image/jpeg;base64,${frame.base64}`;
      img.title = `#${frame.index} @ ${frame.timestampSec.toFixed(2)}s`;
      framesEl.appendChild(img);
    }

    lastJson = data.analysis;
    analysisJsonEl.textContent = pretty(lastJson);
    renderHumanReadable(data);
  } catch (e) {
    setProgress("");
    stopTimer();
    abortBtn.style.display = "none";
    alert(e.message || String(e));
  } finally {
    analyzeBtn.disabled = false;
  }
});

if (abortBtn) {
  abortBtn.addEventListener("click", async () => {
    try {
      // We don't have streaming session id from server in current API response format
      // but we can still terminate by reloading the page request; instead, we'll call abort endpoint once
      // future improvement: server may stream sessionId early
      if (!currentSessionId) {
        // Nothing tracked; simply stop timer UI
        stopTimer();
        abortBtn.style.display = "none";
        return;
      }
      await fetch("/api/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: currentSessionId })
      });
      stopTimer();
      abortBtn.style.display = "none";
    } catch {}
  });
}

let jsonVisible = false;

toggleJsonBtn.addEventListener("click", () => {
  jsonVisible = !jsonVisible;
  analysisJsonEl.style.display = jsonVisible ? "block" : "none";
  toggleJsonBtn.textContent = jsonVisible ? "隱藏 JSON" : "顯示 JSON";
});

copyJsonBtn.addEventListener("click", async () => {
  if (!lastJson) return;
  try {
    await navigator.clipboard.writeText(pretty(lastJson));
    copyJsonBtn.textContent = "已複製";
    setTimeout(() => (copyJsonBtn.textContent = "複製 JSON"), 1200);
  } catch {}
});

downloadJsonBtn.addEventListener("click", () => {
  if (!lastJson) return;
  const blob = new Blob([pretty(lastJson)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "analysis.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}); 