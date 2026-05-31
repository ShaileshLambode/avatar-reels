import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { 
  installWhisperCpp, 
  downloadWhisperModel, 
  transcribe, 
  toCaptions 
} from "@remotion/install-whisper-cpp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to get CLI arguments
const getArg = (flag) => {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : null;
};

const videoPath = getArg("--video");
const audioPath = getArg("--audio");
const outputPath = getArg("--output");
const scriptPath = getArg("--script");
const template = getArg("--template") || "hormozi";
const fontSize = parseInt(getArg("--fontSize") || "72", 10);
const highlightColor = getArg("--highlightColor") || "#FFE600";

if (!videoPath || !audioPath || !outputPath || !scriptPath) {
  console.error("Error: --video, --audio, --output, and --script are required");
  process.exit(1);
}

// Extract reelId and set up public folder asset coping to bypass Chrome file:// restrictions
const reelId = path.basename(path.dirname(videoPath)) || "temp";
const publicDir = path.join(__dirname, "public");
const publicVideoFilename = `composed_${reelId}.mp4`;
const publicVideoPath = path.join(publicDir, publicVideoFilename);

// Helper to clean up temporary public asset
const cleanupPublicAsset = () => {
  try {
    if (fs.existsSync(publicVideoPath)) {
      fs.unlinkSync(publicVideoPath);
      console.log(`[Remotion Render] Cleaned up temporary public asset: ${publicVideoPath}`);
    }
  } catch (e) {
    console.error(`[Remotion Render] Warning: Failed to clean up public asset: ${e.message}`);
  }
};

// Ensure output directories exist
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

try {
  console.log(`[Remotion Render] Target video: ${videoPath}`);
  console.log(`[Remotion Render] Target audio: ${audioPath}`);
  console.log(`[Remotion Render] Output destination: ${outputPath}`);

  // Create public folder and copy composed video there
  console.log("[Remotion Render] Copying composed video to Remotion public server...");
  fs.mkdirSync(publicDir, { recursive: true });
  fs.copyFileSync(videoPath, publicVideoPath);
  console.log(`[Remotion Render] Served public asset ready at: ${publicVideoPath}`);

  // 1. Probe video duration using ffprobe
  console.log("[Remotion Render] Probing video duration using ffprobe...");
  let durationSec = 0;
  try {
    const ffprobeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
    const ffprobeOutput = execSync(ffprobeCmd).toString().trim();
    durationSec = parseFloat(ffprobeOutput);
    console.log(`[Remotion Render] Detected video duration: ${durationSec} seconds`);
  } catch (err) {
    console.error(`[Remotion Render] Warning: ffprobe failed to probe video duration: ${err.message}`);
    // Fall back to estimated duration (e.g. 30 seconds)
    durationSec = 30;
  }

  // Calculate duration in frames (30fps)
  const durationInFrames = Math.max(90, Math.round(durationSec * 30));

  // 2. Convert voice audio to 16kHz mono WAV for Whisper.cpp
  console.log("[Remotion Render] Preparing 16kHz mono audio for transcription...");
  const tempDir = path.dirname(scriptPath);
  const audio16kPath = path.join(tempDir, "audio_16k.wav");
  try {
    const ffmpegCmd = `ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 "${audio16kPath}"`;
    execSync(ffmpegCmd, { stdio: "ignore" });
    console.log(`[Remotion Render] Converted 16kHz audio saved at: ${audio16kPath}`);
  } catch (err) {
    throw new Error(`Failed to convert audio for transcription: ${err.message}`);
  }

  // 3. Perform transcription with Whisper.cpp (with heuristic fallback)
  let wordCaptions = [];
  let isWhisperSuccessful = false;

  try {
    console.log("[Remotion Render] Initializing Whisper.cpp transcribing engine...");
    const whisperFolder = path.join(__dirname, "whisper.cpp");

    console.log("[Remotion Render] Downloading and compiling Whisper.cpp (version 1.5.5)...");
    await installWhisperCpp({
      to: whisperFolder,
      version: "1.5.5"
    });

    console.log("[Remotion Render] Resolving Whisper model 'tiny.en' (English optimized)...");
    await downloadWhisperModel({
      model: "tiny.en",
      folder: whisperFolder
    });

    console.log("[Remotion Render] Running Whisper local voice transcription...");
    const whisperCppOutput = await transcribe({
      model: "tiny.en",
      whisperPath: whisperFolder,
      whisperCppVersion: "1.5.5",
      inputPath: audio16kPath,
      tokenLevelTimestamps: true
    });

    console.log("[Remotion Render] Formatting transcript into word-level segments...");
    const { captions } = toCaptions({ whisperCppOutput });

    if (captions && captions.length > 0) {
      const merged = [];
      for (let i = 0; i < captions.length; i++) {
        const c = captions[i];
        
        let startMs = 0;
        let endMs = 0;
        
        if (c.startMs !== undefined) startMs = c.startMs;
        else if (c.from !== undefined) startMs = c.from * 1000;
        else if (c.start !== undefined) startMs = c.start * 1000;
        
        if (c.endMs !== undefined) endMs = c.endMs;
        else if (c.to !== undefined) endMs = c.to * 1000;
        else if (c.end !== undefined) endMs = c.end * 1000;

        // Check if the current token represents the start of a new word (has a leading space, BPE 'Ġ', or standard space)
        const hasLeadingSpace = /^[ \sĠ]/.test(c.text);
        const cleanedText = c.text.trim();

        if (i === 0 || hasLeadingSpace || merged.length === 0) {
          merged.push({
            text: cleanedText,
            startMs: Math.round(startMs),
            endMs: Math.round(endMs)
          });
        } else {
          // Merge this sub-word suffix token directly into the last word
          const lastWord = merged[merged.length - 1];
          lastWord.text += cleanedText;
          lastWord.endMs = Math.round(endMs);
        }
      }

      // Filter out any empty items and assign
      wordCaptions = merged.filter(w => w.text.length > 0);
      console.log(`[Remotion Render] Transcribed and merged into ${wordCaptions.length} whole words successfully!`);
      isWhisperSuccessful = true;
    } else {
      console.warn("[Remotion Render] Warning: Whisper returned empty captions.");
    }
  } catch (err) {
    console.error(`[Remotion Render] WARNING: Whisper transcription failed: ${err.message}`);
  }

  // Clean up 16k WAV file
  try {
    if (fs.existsSync(audio16kPath)) {
      fs.unlinkSync(audio16kPath);
    }
  } catch (e) {}

  // Heuristic Fallback if Whisper failed or was skipped
  if (!isWhisperSuccessful) {
    console.log("[Remotion Render] Applying bulletproof heuristic-based word caption alignment fallback...");
    try {
      const scriptData = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
      const scenes = scriptData.scenes || [];
      const totalChars = scenes.reduce((acc, s) => acc + (s.dialogue || "").length, 0);

      let currentStartMs = 0;
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const text = scene.dialogue || "";
        if (!text.trim()) continue;

        const charFraction = totalChars > 0 ? (text.length / totalChars) : (1 / scenes.length);
        const sceneDurationMs = charFraction * durationSec * 1000;
        const words = text.split(/\s+/).filter(Boolean);
        
        if (words.length > 0) {
          const wordDurationMs = sceneDurationMs / words.length;
          for (let w = 0; w < words.length; w++) {
            wordCaptions.push({
              text: words[w],
              startMs: Math.round(currentStartMs + w * wordDurationMs),
              endMs: Math.round(currentStartMs + (w + 1) * wordDurationMs)
            });
          }
        }
        currentStartMs += sceneDurationMs;
      }
      console.log(`[Remotion Render] Heuristic fallback generated ${wordCaptions.length} words successfully.`);
    } catch (fallbackErr) {
      console.error(`[Remotion Render] Heuristic fallback error: ${fallbackErr.message}`);
      cleanupPublicAsset();
      process.exit(1);
    }
  }

  // 4. Bundle and render
  console.log("[Remotion Render] Bundling React composition project...");
  const entryPoint = path.resolve(__dirname, "./src/index.ts");
  const bundleLocation = await bundle({ entryPoint, verbose: false });
  console.log(`[Remotion Render] Bundle successfully compiled: ${bundleLocation}`);

  // Construct render props using the served public video filename
  const renderProps = {
    videoSrc: publicVideoFilename,
    captions: wordCaptions,
    durationInFrames,
    fps: 30,
    width: 1080,
    height: 1920,
    fontSize,
    highlightColor
  };

  console.log("[Remotion Render] Resolving composition 'CaptionedVideo'...");
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "CaptionedVideo",
    inputProps: renderProps
  });

  // Apply overrides
  composition.durationInFrames = durationInFrames;
  composition.width = 1080;
  composition.height = 1920;

  console.log(`[Remotion Render] Launching headless browser to render ${durationInFrames} frames (30fps)...`);
  
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: renderProps,
    concurrency: 1, // Minimize CPU/Memory overload
    onProgress: ({ progress }) => {
      // Standard format for parent process to intercept progress percentages
      console.log(`PROGRESS:${Math.round(progress * 100)}`);
    }
  });

  console.log("[Remotion Render] Success!");
  cleanupPublicAsset();
  process.exit(0);
} catch (error) {
  console.error("[Remotion Render] Headless render error:", error);
  cleanupPublicAsset();
  process.exit(1);
}
