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
        relative_motion_mode: config?.relative_motion_mode !== false
      },
      reelId.toString(),
      onProgress
    );

    return result; // { avatarVideoPath: 'storage/temp/{reelId}/avatar.mp4' }
  }

  async _handleLipSync(jobData, onProgress) {
    const { reelId, assets } = jobData;

    if (onProgress) onProgress(10, "[LipSync] Checking upstream avatar video...");

    // Verify avatar video exists from Stage 3
    const avatarPath = path.resolve(__dirname, "../../../", assets.avatarVideoPath);
    if (!fs.existsSync(avatarPath)) {
      throw new Error(`LipSync: Avatar video not found at ${avatarPath}`);
    }

    if (onProgress) onProgress(50, "[LipSync] LivePortrait output is already lip-synced. Passing through...");
    if (onProgress) onProgress(100, "[LipSync] Passthrough complete!");

    // Forward the avatar video path as the composedVideoPath for downstream stages
    return {
      composedVideoPath: sanitizePath(assets.avatarVideoPath)
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
