const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const config = require("../config/env");
const { ensureDir, sanitizePath } = require("../utils/helpers");
const logger = require("../utils/logger");

class AvatarService {
  constructor() {
    this.liveportraitUrl = config.AVATAR_SERVICE_URL || "http://localhost:5200";
  }

  /**
   * Check if the designated Python service is running
   * @private
   */
  async _checkHealth() {
    const targetUrl = this.liveportraitUrl;
    try {
      const response = await axios.get(`${targetUrl}/health`, { timeout: 5000 });
      if (response.status !== 200) {
        throw new Error(`HTTP status ${response.status}`);
      }
      if (response.data.status !== "ok") {
        throw new Error(response.data.message || "LivePortrait backend status is not ok");
      }
    } catch (error) {
      const isRefused = error.code === "ECONNREFUSED";
      const setupScript = "cd avatar-reels/ai-engines/avatar && powershell -ExecutionPolicy Bypass -File start-avatar.ps1";
      const errMsg = isRefused
        ? `LivePortrait Python server is not running at ${targetUrl}. Please start it using: ${setupScript}`
        : `LivePortrait Python server health check failed: ${error.message}`;
      throw new Error(`AvatarService: ${errMsg}`);
    }
  }

  /**
   * Resolve and validate absolute path of the source face image
   * @private
   */
  _resolveSourceImage(avatarConfig) {
    if (avatarConfig && avatarConfig.avatarImage && avatarConfig.avatarImage !== "default_avatar.jpg") {
      // 1. Try absolute or direct path
      const directPath = path.resolve(avatarConfig.avatarImage);
      if (fs.existsSync(directPath)) {
        return directPath;
      }
      // 2. Try relative to the project root
      const projectPath = path.resolve(__dirname, "../../../", avatarConfig.avatarImage);
      if (fs.existsSync(projectPath)) {
        return projectPath;
      }
      throw new Error(`Custom avatar image not found at specified path: ${avatarConfig.avatarImage}`);
    }

    // 3. Fallback to default avatar image
    const defaultPath = path.resolve(__dirname, "../../../assets/avatars/default.png");
    if (!fs.existsSync(defaultPath)) {
      throw new Error(`Default avatar image not found at: ${defaultPath}. Make sure to generate the default avatar first.`);
    }
    return defaultPath;
  }

  /**
   * Core generator function driven by source image and voice audio
   * @param {object} assets - Object containing upstream assets (needs assets.audioPath)
   * @param {object} avatarConfig - Configuration for animation (engine, still_mode, etc.)
   * @param {string} reelId - The ID of the reel
   * @param {function} onProgress - Progress reporting callback
   * @returns {Promise<object>} Result containing standard relative path of the generated video
   */
  async generateAvatar(assets, avatarConfig, reelId, onProgress) {
    if (!assets || !assets.audioPath) {
      throw new Error("AvatarService: No driven audio file path provided in assets");
    }

    const targetUrl = this.liveportraitUrl;

    // Dynamic Mock Bypass for rapid local CPU development
    if (config.MOCK_AVATAR) {
      if (onProgress) onProgress(15, `[Avatar] MOCK MODE ACTIVE: Generating simulated LivePortrait video...`);
      
      const tempDir = path.resolve(__dirname, "../../../storage/temp", reelId.toString());
      ensureDir(tempDir);
      const finalVideoPath = path.join(tempDir, "avatar.mp4");
      
      // Resolve source image path
      const sourceImagePath = this._resolveSourceImage(avatarConfig);
      
      // Resolve input audio path
      const audioPath = path.resolve(__dirname, "../../../", assets.audioPath);
      if (!fs.existsSync(audioPath)) {
        throw new Error(`AvatarService: Driven audio file not found at: ${audioPath}`);
      }

      if (onProgress) onProgress(40, `[Avatar] MOCK MODE: Compiling spokesperson portrait with vocal track via FFmpeg (LivePortrait fallback)...`);
      
      // Resolve FFmpeg path dynamically
      const ffmpegBin = fs.existsSync("C:\\ffmpeg\\bin\\ffmpeg.exe") ? "C:\\ffmpeg\\bin\\ffmpeg.exe" : "ffmpeg";
      
      const { execSync } = require("child_process");
      try {
        // Compile static image looped perfectly to the audio duration
        const cmd = `"${ffmpegBin}" -y -loop 1 -i "${sourceImagePath}" -i "${audioPath}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest "${finalVideoPath}"`;
        logger.info(`AvatarService (Mock): Running FFmpeg loop command: ${cmd}`);
        execSync(cmd, { stdio: "ignore" });
      } catch (err) {
        logger.error(`AvatarService (Mock) FFmpeg failed: ${err.message}. Copying fallback video.`);
        throw new Error(`AvatarService Mock compilation failed: ${err.message}`);
      }
      
      if (onProgress) onProgress(100, `[Avatar] MOCK MODE: Talking-head placeholder video generated successfully!`);
      return {
        avatarVideoPath: sanitizePath(`storage/temp/${reelId}/avatar.mp4`),
      };
    }

    if (onProgress) onProgress(5, `[Avatar] Checking LivePortrait service health...`);
    await this._checkHealth();

    const tempDir = path.resolve(__dirname, "../../../storage/temp", reelId.toString());
    ensureDir(tempDir);

    // Resolve source image path
    if (onProgress) onProgress(10, `[Avatar] Resolving source avatar image...`);
    const sourceImagePath = this._resolveSourceImage(avatarConfig);
    logger.info(`AvatarService: Using source image: ${sourceImagePath}`);

    // Resolve input audio path
    const audioPath = path.resolve(__dirname, "../../../", assets.audioPath);
    if (!fs.existsSync(audioPath)) {
      throw new Error(`AvatarService: Driven audio file not found at: ${audioPath}`);
    }
    logger.info(`AvatarService: Using driven audio: ${audioPath}`);

    const finalVideoPath = path.join(tempDir, "avatar.mp4");

    if (onProgress) {
      onProgress(15, `[Avatar] Launching LivePortrait animation pipeline...`);
      onProgress(20, `[Avatar] Processing face expression generation (LivePortrait)...`);
    }

    try {
      // Build form-data for streaming files to FastAPI
      const form = new FormData();
      const endpoint = "/neutralize";
      
      form.append("portrait", fs.createReadStream(sourceImagePath));
      form.append("duration_seconds", "3.0");

      // Stream the response directly to storage to avoid RAM blowup
      const response = await axios.post(`${targetUrl}${endpoint}`, form, {
        responseType: "stream",
        headers: {
          ...form.getHeaders(),
        },
        timeout: 0, // Disable timeout for CPU environments
      });

      if (onProgress) onProgress(80, "[Avatar] Writing video stream to disk...");

      const writer = fs.createWriteStream(finalVideoPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", (err) => {
          logger.error(`AvatarService writing error: ${err.message}`);
          reject(err);
        });
      });

      // Verify file was written and is not empty
      if (!fs.existsSync(finalVideoPath) || fs.statSync(finalVideoPath).size === 0) {
        throw new Error("Generated MP4 file is empty or missing from disk");
      }

      if (onProgress) onProgress(100, `[Avatar] Talking-head video generated successfully!`);

      return {
        avatarVideoPath: sanitizePath(`storage/temp/${reelId}/avatar.mp4`),
      };
    } catch (error) {
      logger.error(`AvatarService generation error: ${error.message}`);
      
      // Clean up failed file if it exists
      try {
        if (fs.existsSync(finalVideoPath)) {
          fs.unlinkSync(finalVideoPath);
        }
      } catch (cleanupErr) {}

      // Handle stream errors which don't have standard error.response.data
      const errorMsg = error.response?.data?.detail || error.message;
      throw new Error(`LivePortrait generation failed: ${errorMsg}`);
    }
  }
}

module.exports = AvatarService;
