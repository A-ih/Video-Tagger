# Video Tagger

Uniformly sample video keyframes and tag them with Qwen VL via local Ollama or OpenRouter.

## Output language
- Default output language for captions/tags is Traditional Chinese (zh-Hant). Configure via `TAG_LANGUAGE` and `TAG_LANGUAGE_LABEL` or edit `server/config.js`.

## Prerequisites
- Node.js 18+ (or use Docker)
- ffmpeg installed (if running locally)
- Optional: Ollama running locally with the `qwen2.5vl:7b` model pulled
- Optional: OpenRouter API key if using OpenRouter provider

## Config
Configure defaults via environment variables or edit `server/config.js`.
For secrets (like OpenRouter API key), you may also create `server/config.secrets.json`:
```json
{ "openrouterApiKey": "sk-or-..." }
```
This file is ignored by Git.

Key env vars:
- `PORT` (default `3020`)
- `DEFAULT_NUM_FRAMES` (default `8`)
- `OUTPUT_WIDTH` (default `768`)
- `JPEG_QUALITY` (default `2`)
- `TAG_LANGUAGE` (default `zh-Hant`)
- `TAG_LANGUAGE_LABEL` (default `Traditional Chinese`)
- `OLLAMA_BASE_URL` (default `http://host.docker.internal:11434` in Docker)
- `OLLAMA_MODEL` (default `qwen2.5vl:7b`)
- `OPENROUTER_API_KEY` or `server/config.secrets.json` with `openrouterApiKey`
- `OPENROUTER_MODEL` (default `qwen/qwen2.5-vl-72b-instruct:free`)

## Run locally
```bash
npm install
npm run dev
# open http://localhost:3020
```

## Docker
Build and run:
```bash
docker build -t video-tagger .
docker run --rm -it \
  -e OPENROUTER_API_KEY=sk-or-... \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  -p 3020:3020 \
  video-tagger
```
Alternatively, mount a secrets file:
```bash
docker run --rm -it \
  -v "$PWD/server/config.secrets.json":/app/server/config.secrets.json:ro \
  -p 3020:3020 video-tagger
```

Open `http://localhost:3020`.

## API
- `POST /api/analyze` multipart form: fields `video` (file), `numFrames`, `provider` (`ollama`|`openrouter`).

## Notes
- Frames are extracted uniformly by timestamp using ffmpeg.
- Responses are coerced to JSON; if the model returns prose, we attempt to extract JSON.
- Temporary files are cleaned after each request.
- The UI renders a journalist-friendly summary, with JSON available to view/copy/download. 