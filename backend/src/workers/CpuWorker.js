const BaseWorker = require("./BaseWorker");
const path = require("path");
const fs = require("fs");
const { sanitizePath, ensureDir } = require("../utils/helpers");
const logger = require("../utils/logger");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CpuWorker extends BaseWorker {
  constructor() {
    super("cpu", ["script", "voice", "avatar", "lipsync", "composition", "remotion"]);
  }

  /**
   * Execute a pipeline job by routing to specific handler
   * @param {string} jobType 
   * @param {object} jobData 
   * @param {function} onProgress 
   * @returns {Promise<object>}
   */
  async execute(jobType, jobData, onProgress) {
    this.activeJobs++;
    logger.info(`CpuWorker starting execution of job type: ${jobType} for reel: ${jobData.reelId}`);
    try {
      switch (jobType) {
        case "script":
          return await this._handleScript(jobData, onProgress);
        case "voice":
          return await this._handleVoice(jobData, onProgress);
        case "avatar":
          return await this._handleAvatar(jobData, onProgress);
        case "lipsync":
          return await this._handleLipSync(jobData, onProgress);
        case "composition":
          return await this._handleComposition(jobData, onProgress);
        case "remotion":
          return await this._handleRemotion(jobData, onProgress);
        default:
          throw new Error(`Unknown job type: ${jobType}`);
      }
    } catch (error) {
      this.lastError = error;
      logger.error(`CpuWorker error executing job type ${jobType} for reel ${jobData.reelId}: ${error.message}`);
      throw error;
    } finally {
      this.activeJobs--;
    }
  }

  /**
   * Simulate a job with incremental progress reporting and custom delay
   */
  async _simulateWork(reelId, stageName, steps, onProgress) {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (onProgress) {
        onProgress(step.percent, `[${stageName}] ${step.message}`);
      }
      await delay(500); // 4 steps * 500ms = 2s total execution delay
    }
  }

  async _handleScript(jobData, onProgress) {
    const { prompt, config } = jobData;
    const { scriptService } = require("../services");

    const result = await scriptService.generateScript(prompt, config, onProgress);
    return result;
  }

  async _handleVoice(jobData, onProgress) {
    const { reelId, script, config } = jobData;
    const { voiceService } = require("../services");

    logger.info(`CpuWorker delegating voice synthesis for reel: ${reelId} to VoiceService`);
    
    // config could contain voice: "Claribel Dervla" or other custom voice presets. 
    // Defaults to the internal speaker "Claribel Dervla".
    const result = await voiceService.generateVoice(
      script.scenes,
      { 
        voice: config?.voice || "Claribel Dervla", 
        language: config?.language || "en" 
      },
      reelId.toString(),
      onProgress
    );

    return result; // { audioPath: 'storage/temp/{reelId}/audio.wav' }
  }

  async _handleAvatar(jobData, onProgress) {
    const { reelId, config, assets } = jobData;
    const { avatarService } = require("../services");

    logger.info(`CpuWorker: Delegating avatar generation for reel ${reelId} to AvatarService`);

    const result = await avatarService.generateAvatar(
      assets,
      {
        avatarImage: config?.avatarImage || null,
        relative_motion_mode: config?.relative_motion_mode !== false,
        engine: config?.engine || null
      },
      reelId.toString(),
      onProgress
    );

    return result; // { avatarVideoPath: 'storage/temp/{reelId}/avatar.mp4' }
  }

  async _handleLipSync(jobData, onProgress) {
    const { reelId, assets } = jobData;
    const axios = require("axios");
    const FormData = require("form-data");

    if (onProgress) onProgress(10, "[LipSync] Checking upstream assets...");

    // Verify avatar video exists from Stage 3
    const avatarPath = path.resolve(__dirname, "../../../", assets.avatarVideoPath);
    if (!fs.existsSync(avatarPath)) {
      throw new Error(`LipSync: Avatar video not found at ${avatarPath}`);
    }

    // Verify audio exists from Stage 2
    const audioPath = path.resolve(__dirname, "../../../", assets.audioPath);
    if (!fs.existsSync(audioPath)) {
      throw new Error(`LipSync: Speech audio file not found at ${audioPath}`);
    }

    const config = require("../config/env");
    if (config.MOCK_AVATAR) {
      if (onProgress) onProgress(20, "[LipSync] MOCK MODE ACTIVE: Simulating MuseTalk lip-sync and CodeFormer face enhancement...");
      const tempDir = path.resolve(__dirname, "../../../storage/temp", reelId.toString());
      ensureDir(tempDir);
      const finalComposedPath = path.join(tempDir, "composed.mp4");
      fs.copyFileSync(avatarPath, finalComposedPath);
      
      if (onProgress) onProgress(100, "[LipSync] MOCK MODE: LipSync and enhancement complete!");
      return {
        composedVideoPath: sanitizePath(`storage/temp/${reelId}/composed.mp4`)
      };
    }

    // MuseTalk service URL and config
    const museTalkUrl = process.env.MUSETALK_SERVICE_URL || "http://localhost:5300";
    const codeFormerUrl = process.env.CODEFORMER_SERVICE_URL || "http://localhost:5500";
    const bboxShift = parseInt(process.env.MUSETALK_BBOX_SHIFT || "0", 10);
    const fidelityWeight = parseFloat(process.env.CODEFORMER_FIDELITY || "0.7");

    const tempDir = path.resolve(__dirname, "../../../storage/temp", reelId.toString());
    ensureDir(tempDir);

    const rawLipsyncPath = path.join(tempDir, "lipsynced_raw.mp4");
    const finalComposedPath = path.join(tempDir, "composed.mp4");

    // ── Step A: Call MuseTalk LipSync Service ─────────────────────────────────
    if (onProgress) onProgress(20, "[LipSync] Running MuseTalk audio-driven lipsync...");
    
    try {
      const museTalkForm = new FormData();
      museTalkForm.append("portrait", fs.createReadStream(avatarPath));
      museTalkForm.append("audio", fs.createReadStream(audioPath));
      museTalkForm.append("bbox_shift", bboxShift.toString());

      logger.info(`CpuWorker: Calling MuseTalk lipsync at ${museTalkUrl}/lipsync`);
      const museTalkResponse = await axios.post(`${museTalkUrl}/lipsync`, museTalkForm, {
        responseType: "stream",
        headers: {
          ...museTalkForm.getHeaders(),
        },
        timeout: 600000, // 10 minutes timeout
      });

      if (onProgress) onProgress(60, "[LipSync] Writing MuseTalk output...");

      const writer1 = fs.createWriteStream(rawLipsyncPath);
      museTalkResponse.data.pipe(writer1);

      await new Promise((resolve, reject) => {
        writer1.on("finish", resolve);
        writer1.on("error", reject);
      });

      logger.info(`CpuWorker: MuseTalk lipsync successful. Output saved to ${rawLipsyncPath}`);
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message;
      logger.error(`CpuWorker: MuseTalk lipsync failed: ${errorMsg}`);
      throw new Error(`MuseTalk lipsync failed: ${errorMsg}`);
    }

    // ── Step B: Call CodeFormer Face Enhancement ─────────────────────────────
    if (onProgress) onProgress(70, "[LipSync] Enhancing face via CodeFormer...");
    
    try {
      const codeFormerForm = new FormData();
      codeFormerForm.append("video", fs.createReadStream(rawLipsyncPath));
      codeFormerForm.append("fidelity_weight", fidelityWeight.toString());
      codeFormerForm.append("face_upsample", "true");

      logger.info(`CpuWorker: Calling CodeFormer enhance at ${codeFormerUrl}/enhance`);
      const codeFormerResponse = await axios.post(`${codeFormerUrl}/enhance`, codeFormerForm, {
        responseType: "stream",
        headers: {
          ...codeFormerForm.getHeaders(),
        },
        timeout: 600000, // 10 minutes timeout
      });

      if (onProgress) onProgress(90, "[LipSync] Writing CodeFormer output...");

      const writer2 = fs.createWriteStream(finalComposedPath);
      codeFormerResponse.data.pipe(writer2);

      await new Promise((resolve, reject) => {
        writer2.on("finish", resolve);
        writer2.on("error", reject);
      });

      logger.info(`CpuWorker: CodeFormer enhancement successful. Output saved to ${finalComposedPath}`);
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.message;
      logger.warn(`CpuWorker: CodeFormer failed, falling back to raw lipsync. Error: ${errorMsg}`);
      
      // Fallback: copy raw lipsynced video as composed video
      fs.copyFileSync(rawLipsyncPath, finalComposedPath);
      if (onProgress) onProgress(95, "[LipSync] CodeFormer failed, using raw lipsync fallback...");
    }

    if (onProgress) onProgress(100, "[LipSync] LipSync and enhancement complete!");

    return {
      composedVideoPath: sanitizePath(`storage/temp/${reelId}/composed.mp4`)
    };
  }

  async _handleComposition(jobData, onProgress) {
    const { reelId, config, assets } = jobData;
    const { compositionService } = require("../services");

    logger.info(`CpuWorker: Delegating media composition for reel ${reelId} to CompositionService`);

    const result = await compositionService.compose(
      assets,
      {
        music: config?.music || null,
        musicVolume: config?.musicVolume || 0.15
      },
      reelId.toString(),
      onProgress
    );

    return result; // { composedVideoPath: 'storage/temp/{reelId}/composed.mp4' }
  }

  async _handleRemotion(jobData, onProgress) {
    const { reelId, script, config, assets } = jobData;
    const { captionService } = require("../services");

    logger.info(`CpuWorker: Delegating caption rendering for reel ${reelId} to CaptionService`);

    const result = await captionService.renderCaptions(
      assets,
      script,
      {
        template: config?.template || "hormozi",
        fontSize: config?.fontSize || 72,
        highlightColor: config?.highlightColor || "#FFE600"
      },
      reelId.toString(),
      onProgress
    );

    return result; // { finalReelPath: 'storage/exports/{reelId}/reel_final.mp4' }
  }
}

module.exports = CpuWorker;
