import { spawn } from "child_process";
import fs from "fs";
import path from "path";

function runProcess(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stderr = "";
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr}`));
    });
  });
}

async function probeDurationSeconds(filePath) {
  const args = [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath
  ];
  const { stdout } = await runProcess("ffprobe", args);
  const duration = parseFloat(stdout.trim());
  if (!isFinite(duration) || duration <= 0) {
    throw new Error(`Unable to probe video duration for ${filePath}`);
  }
  return duration;
}

export async function extractUniformFrames({ inputFilePath, outputDirPath, numFrames, outputWidth, jpegQuality }) {
  const durationSec = await probeDurationSeconds(inputFilePath);

  const timestamps = [];
  for (let i = 0; i < numFrames; i += 1) {
    // Center of i-th segment: (i + 0.5) / numFrames
    const t = durationSec * ((i + 0.5) / numFrames);
    timestamps.push(t);
  }

  const frames = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const t = timestamps[i];
    const fileName = `frame_${String(i + 1).padStart(3, "0")}.jpg`;
    const outPath = path.join(outputDirPath, fileName);

    const args = [
      "-ss", `${t}`,
      "-i", inputFilePath,
      "-frames:v", "1",
      "-q:v", `${jpegQuality}`,
      "-vf", `scale=${outputWidth}:-2`,
      outPath
    ];

    await runProcess("ffmpeg", args);

    const data = fs.readFileSync(outPath);
    const base64Data = data.toString("base64");
    frames.push({ fileName, outPath, base64Data });
  }

  return { frames, timestamps };
} 