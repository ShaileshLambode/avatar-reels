const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { ensureDir, sanitizePath } = require("../utils/helpers");
const logger = require("../utils/logger");

class CaptionService {
  /**
   * Render TikTok-style captions over the composed video using Remotion and Whisper
   * @param {object} assets - The input assets from upstream stages
   * @param {object} script - The Reel script containing scenes dialogue
   * @param {object} config - Caption styling configuration
   * @param {string} reelId - The ID of the reel
   * @param {function} onProgress - Progress reporting callback
   * @returns {Promise<object>}
   */
  async renderCaptions(assets, script, config, reelId, onProgress) {
    if (!assets || !assets.composedVideoPath) {
      throw new Error("CaptionService: Missing upstream composedVideoPath");
    }
    if (!assets.audioPath) {
      throw new Error("CaptionService: Missing upstream audioPath");
    }
    if (!script || !script.scenes || script.scenes.length === 0) {
      throw new Error("CaptionService: Invalid or missing script scenes");
    }

    if (onProgress) onProgress(5, "[Captions] Initializing captions engine...");

    const videoPath = path.resolve(__dirname, "../../../", assets.composedVideoPath);
    const audioPath = path.resolve(__dirname, "../../../", assets.audioPath);
    const exportDir = path.resolve(__dirname, "../../../storage/exports", reelId);
    ensureDir(exportDir);
    const outputPath = path.join(exportDir, "reel_final.mp4");

    if (!fs.existsSync(videoPath)) {
      throw new Error(`CaptionService: Composed video not found at ${videoPath}`);
    }
    if (!fs.existsSync(audioPath)) {
      throw new Error(`CaptionService: Original voice audio not found at ${audioPath}`);
    }

    // 1. Write the script scenes into a temporary JSON file to avoid CLI command limits
    const tempDir = path.resolve(__dirname, "../../../storage/temp", reelId);
    ensureDir(tempDir);
    const scriptJsonPath = path.join(tempDir, "script_data.json");
    fs.writeFileSync(scriptJsonPath, JSON.stringify(script, null, 2));

    const remotionDir = path.resolve(__dirname, "../../../remotion");

    logger.info(`CaptionService: Spawning Remotion render subprocess for reel ${reelId}`);

    return new Promise((resolve, reject) => {
      // 2. Spawn the node subprocess running render.mjs inside the remotion/ sub-project
      const child = spawn(
        "node",
        [
          "render.mjs",
          "--video", videoPath,
          "--audio", audioPath,
          "--output", outputPath,
          "--script", scriptJsonPath,
          "--template", config.template || "hormozi",
          "--fontSize", String(config.fontSize || 72),
          "--highlightColor", config.highlightColor || "#FFE600"
        ],
        {
          cwd: remotionDir,
          env: {
            ...process.env,
            // Ensure Chrome/Puppeteer works seamlessly in headless environments
            PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: "true"
          }
        }
      );

      let errorMsg = "";

      // Parse progress output and logger info from stdout
      child.stdout.on("data", (data) => {
        const output = data.toString();
        const lines = output.split(/\r?\n/);
        
        for (const line of lines) {
          if (!line.trim()) continue;

          if (line.startsWith("PROGRESS:")) {
            const rawPercent = parseInt(line.substring(9), 10);
            if (!isNaN(rawPercent) && onProgress) {
              // Whisper setup + transcribing + bundling occupies 0-50% progress
              // Remotion frame rendering occupies 50-95% progress
              const percent = 50 + Math.round((rawPercent / 100) * 45);
              onProgress(Math.min(percent, 95), `[Captions] Rendering video frames (${rawPercent}%)...`);
            }
          } else if (line.startsWith("[Remotion Render]")) {
            logger.info(`CaptionService Subprocess: ${line}`);
            if (onProgress) {
              // Extract status updates to display to user
              const msg = line.replace("[Remotion Render]", "").trim();
              // Don't override progress % during heavy rendering
              if (!msg.startsWith("Rendering") && !msg.startsWith("PROGRESS")) {
                onProgress(40, `[Captions] ${msg}`);
              }
            }
          } else {
            logger.debug(`CaptionService Subprocess stdout: ${line}`);
          }
        }
      });

      child.stderr.on("data", (data) => {
        const output = data.toString();
        errorMsg += output;
        logger.error(`CaptionService Subprocess stderr: ${output}`);
      });

      child.on("close", (code) => {
        // Clean up the temp script JSON file
        try {
          if (fs.existsSync(scriptJsonPath)) {
            fs.unlinkSync(scriptJsonPath);
          }
        } catch (e) {}

        if (code !== 0) {
          logger.error(`CaptionService: Subprocess exited with code ${code}. Error: ${errorMsg}`);
          return reject(
            new Error(`CaptionService: Remotion render subprocess failed (exit code ${code}): ${errorMsg || "Unknown error"}`)
          );
        }

        if (onProgress) onProgress(98, "[Captions] Verifying final file...");

        // 3. Verify output file exists and has content
        if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
          return reject(new Error("CaptionService: Render completed, but final output file is empty or missing"));
        }

        if (onProgress) onProgress(100, "[Captions] Captioned video render complete!");
        logger.info(`CaptionService: Successfully rendered captioned reel to ${outputPath}`);
        
        resolve({
          finalReelPath: sanitizePath(`storage/exports/${reelId}/reel_final.mp4`)
        });
      });
    });
  }
}

module.exports = CaptionService;
