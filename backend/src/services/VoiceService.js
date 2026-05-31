const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const config = require("../config/env");
const { ensureDir, sanitizePath } = require("../utils/helpers");
const logger = require("../utils/logger");

// Configure explicit FFmpeg paths if located at C:\ffmpeg\bin
if (fs.existsSync("C:\\ffmpeg\\bin\\ffmpeg.exe")) {
  ffmpeg.setFfmpegPath("C:\\ffmpeg\\bin\\ffmpeg.exe");
  logger.info("VoiceService: Explicitly set FFmpeg path to C:\\ffmpeg\\bin\\ffmpeg.exe");
}
if (fs.existsSync("C:\\ffmpeg\\bin\\ffprobe.exe")) {
  ffmpeg.setFfprobePath("C:\\ffmpeg\\bin\\ffprobe.exe");
  logger.info("VoiceService: Explicitly set FFprobe path to C:\\ffmpeg\\bin\\ffprobe.exe");
}

class VoiceService {
  constructor() {
    this.ttsUrl = config.TTS_SERVICE_URL;
  }

  /**
   * Check if the Python TTS service is running and model is loaded
   * @private
   */
  async _checkHealth() {
    try {
      const response = await axios.get(`${this.ttsUrl}/health`, { timeout: 5000 });
      if (response.status !== 200) {
        throw new Error(`HTTP status ${response.status}`);
      }
      if (response.data.status !== "ok" || response.data.model_loaded !== true) {
        throw new Error(response.data.error || "Model not loaded");
      }
    } catch (error) {
      const isRefused = error.code === "ECONNREFUSED";
      const errMsg = isRefused
        ? `TTS Python server is not running at ${this.ttsUrl}. Please start it using the PowerShell helper: cd avatar-reels/ai-engines/tts && powershell -ExecutionPolicy Bypass -File start-tts.ps1`
        : `TTS Python server health check failed: ${error.message}`;
      throw new Error(`VoiceService: ${errMsg}`);
    }
  }

  /**
   * Synthesize text to a WAV audio file for a single scene
   * @private
   */
  async _synthesizeScene(text, speakerId, language, outputPath) {
    try {
      const params = new URLSearchParams();
      params.append("text", text);
      params.append("speaker_id", speakerId);
      params.append("language", language);

      const response = await axios.post(`${this.ttsUrl}/synthesize`, params, {
        responseType: "arraybuffer",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 120000, // 2 minutes timeout per scene for CPU synthesis
      });

      fs.writeFileSync(outputPath, response.data);
    } catch (error) {
      const details = error.response?.data?.detail || error.message;
      throw new Error(`TTS Synthesis failed for text "${text.substring(0, 30)}": ${details}`);
    }
  }

  /**
   * Stitch multiple WAV files together without re-encoding using FFmpeg concat demuxer
   * @private
   */
  async _concatenateAudio(scenePaths, outputPath) {
    return new Promise((resolve, reject) => {
      const listFilePath = path.join(path.dirname(outputPath), "concat_list.txt");
      
      try {
        // Create the list file for the ffmpeg concat demuxer
        // Note: FFmpeg expects single quotes and forward slashes, or properly escaped paths
        const listContent = scenePaths.map((p) => `file '${sanitizePath(path.resolve(p))}'`).join("\n");
        fs.writeFileSync(listFilePath, listContent);

        ffmpeg()
          .input(listFilePath)
          .inputOptions(["-f concat", "-safe 0"])
          .outputOptions("-c copy")
          .save(outputPath)
          .on("end", () => {
            try {
              if (fs.existsSync(listFilePath)) {
                fs.unlinkSync(listFilePath);
              }
            } catch (e) {
              logger.warn(`VoiceService: Failed to delete temp list file ${listFilePath}: ${e.message}`);
            }
            resolve();
          })
          .on("error", (err) => {
            try {
              if (fs.existsSync(listFilePath)) {
                fs.unlinkSync(listFilePath);
              }
            } catch (e) {}
            reject(new Error(`FFmpeg audio concatenation failed: ${err.message}`));
          });
      } catch (err) {
        reject(new Error(`Failed to initialize audio stitching: ${err.message}`));
      }
    });
  }

  /**
   * Delete temporary audio files
   * @private
   */
  _cleanupTempFiles(scenePaths) {
    for (const p of scenePaths) {
      try {
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      } catch (err) {
        logger.warn(`VoiceService: Failed to delete temporary file ${p}: ${err.message}`);
      }
    }
  }

  /**
   * Generate synthesized voice track for a full reel script (all scenes)
   * @param {Array<object>} scenes - The array of scene objects from the script
   * @param {object} voiceConfig - Configuration for voice synthesis ({ voice, language })
   * @param {string} reelId - The ID of the reel
   * @param {function} onProgress - Progress reporting callback
   * @returns {Promise<object>} Result containing standard relative path of synthesized audio
   */
  async generateVoice(scenes, voiceConfig, reelId, onProgress) {
    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      throw new Error("VoiceService: Invalid or empty scenes provided");
    }

    if (onProgress) onProgress(5, "[Voice] Checking TTS service health...");
    await this._checkHealth();

    const tempDir = path.resolve(__dirname, "../../../storage/temp", reelId.toString());
    ensureDir(tempDir);

    const scenePaths = [];
    const speakerId = voiceConfig?.voice || "Claribel Dervla";
    const language = voiceConfig?.language || "en";

    try {
      // Synthesize each scene sequentially
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const text = scene.dialogue;
        
        // Report progress in the 10% to 75% range
        const progressPercent = Math.min(10 + Math.round((i / scenes.length) * 65), 75);
        const displayDialogue = text.length > 35 ? `${text.substring(0, 35)}...` : text;
        
        if (onProgress) {
          onProgress(progressPercent, `[Voice] Synthesizing scene ${i + 1}/${scenes.length}: "${displayDialogue}"`);
        }

        const sceneOutputPath = path.join(tempDir, `scene_${i}.wav`);
        await this._synthesizeScene(text, speakerId, language, sceneOutputPath);
        scenePaths.push(sceneOutputPath);
      }

      // Stitch individual audio files into one continuous audio track
      if (onProgress) onProgress(80, "[Voice] Stitching scene audio files...");
      const finalOutputPath = path.join(tempDir, "audio.wav");
      await this._concatenateAudio(scenePaths, finalOutputPath);

      // Clean up scene files
      if (onProgress) onProgress(95, "[Voice] Cleaning up temporary scene files...");
      this._cleanupTempFiles(scenePaths);

      if (onProgress) onProgress(100, "[Voice] Voice synthesis complete!");

      return {
        audioPath: sanitizePath(`storage/temp/${reelId}/audio.wav`),
      };
    } catch (error) {
      // Clean up whatever was successfully written before the error
      this._cleanupTempFiles(scenePaths);
      logger.error(`VoiceService error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = VoiceService;
