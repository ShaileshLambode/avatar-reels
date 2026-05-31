const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const { ensureDir, sanitizePath } = require("../utils/helpers");
const logger = require("../utils/logger");

// Configure explicit FFmpeg paths if located at C:\ffmpeg\bin
if (fs.existsSync("C:\\ffmpeg\\bin\\ffmpeg.exe")) {
  ffmpeg.setFfmpegPath("C:\\ffmpeg\\bin\\ffmpeg.exe");
  logger.info("CompositionService: Explicitly set FFmpeg path to C:\\ffmpeg\\bin\\ffmpeg.exe");
}
if (fs.existsSync("C:\\ffmpeg\\bin\\ffprobe.exe")) {
  ffmpeg.setFfprobePath("C:\\ffmpeg\\bin\\ffprobe.exe");
  logger.info("CompositionService: Explicitly set FFprobe path to C:\\ffmpeg\\bin\\ffprobe.exe");
}

class CompositionService {
  /**
   * Probe video information (dimensions, duration) using ffprobe
   * @private
   * @param {string} videoPath
   * @returns {Promise<object>}
   */
  async _getVideoInfo(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          return reject(new Error(`Failed to probe video: ${err.message}`));
        }
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (!videoStream) {
          return reject(new Error("No video stream found in input video"));
        }
        resolve({
          width: parseInt(videoStream.width, 10),
          height: parseInt(videoStream.height, 10),
          duration: parseFloat(metadata.format.duration || 0)
        });
      });
    });
  }

  /**
   * Resolve background music file path from assets/music
   * @private
   * @param {string} musicTrack
   * @returns {string|null}
   */
  _resolveMusicTrack(musicTrack) {
    if (!musicTrack) return null;
    
    const musicDir = path.resolve(__dirname, "../../../assets/music");
    const trackPath = path.join(musicDir, musicTrack);
    
    // Try different variations
    const pathsToTry = [
      trackPath,
      `${trackPath}.mp3`,
      `${trackPath}.wav`
    ];

    for (const p of pathsToTry) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    logger.warn(`CompositionService: Music track "${musicTrack}" not found in assets/music/`);
    return null;
  }

  /**
   * Compose video by scaling to portrait 1080x1920 with blurred background and mixing BGM
   * @param {object} assets - The input assets object from upstream stages
   * @param {object} compositionConfig - Configuration for BGM (music, musicVolume)
   * @param {string} reelId - The ID of the reel
   * @param {function} onProgress - Progress reporting callback
   * @returns {Promise<object>}
   */
  async compose(assets, compositionConfig, reelId, onProgress) {
    if (!assets || !assets.composedVideoPath) {
      throw new Error("CompositionService: Missing upstream composedVideoPath");
    }
    if (!assets.audioPath) {
      throw new Error("CompositionService: Missing upstream audioPath");
    }

    if (onProgress) onProgress(5, "[Composition] Validating input assets...");

    const inputVideoPath = path.resolve(__dirname, "../../../", assets.composedVideoPath);
    const inputAudioPath = path.resolve(__dirname, "../../../", assets.audioPath);

    if (!fs.existsSync(inputVideoPath)) {
      throw new Error(`CompositionService: Input video not found at ${inputVideoPath}`);
    }
    if (!fs.existsSync(inputAudioPath)) {
      throw new Error(`CompositionService: Input voice audio not found at ${inputAudioPath}`);
    }

    if (onProgress) onProgress(10, "[Composition] Probing input video dimensions...");
    const videoInfo = await this._getVideoInfo(inputVideoPath);
    logger.info(`CompositionService: Video dimensions: ${videoInfo.width}x${videoInfo.height}, duration: ${videoInfo.duration}s`);

    if (onProgress) onProgress(15, "[Composition] Resolving background music track...");
    const musicPath = this._resolveMusicTrack(compositionConfig.music);
    const musicVolume = parseFloat(compositionConfig.musicVolume) || 0.15;

    const tempDir = path.resolve(__dirname, "../../../storage/temp", reelId);
    ensureDir(tempDir);
    const outputPath = path.join(tempDir, "composed.mp4");

    if (onProgress) onProgress(20, "[Composition] Preparing FFmpeg filter graph...");

    return new Promise((resolve, reject) => {
      let command = ffmpeg();

      // Input 0: Talking Head video (we only use video stream)
      command = command.input(inputVideoPath);

      // Input 1: Voice audio WAV file (ensures high quality audio and solves sync issues)
      command = command.input(inputAudioPath);

      // Input 2 (Optional): BGM track, looped infinitely
      if (musicPath) {
        command = command.input(musicPath).inputOptions(["-stream_loop -1"]);
      }

      // Filter graph for scaling and padding 1080x1920 with blurred background
      // [0:v] is the talking head video
      let filterComplex = 
        `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:1[bg];` +
        `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];` +
        `[bg][fg]overlay=(W-w)/2:(H-h)/2[v]`;

      if (musicPath) {
        // [1:a] is the voice track, [2:a] is the looped background music track
        filterComplex += `;[1:a]volume=1.0[voice];[2:a]volume=${musicVolume}[bgm];[voice][bgm]amix=inputs=2:duration=first:dropout_transition=0[a]`;
      } else {
        // Just map the voice track directly
        filterComplex += `;[1:a]volume=1.0[a]`;
      }

      command
        .complexFilter(filterComplex)
        .map("[v]")
        .map("[a]")
        .outputOptions([
          "-c:v libx264",
          "-pix_fmt yuv420p",
          "-c:a aac",
          "-b:a 192k",
          "-shortest" // Stop encoding when the shortest stream (video) ends
        ])
        .output(outputPath)
        .on("start", (cmd) => {
          logger.info(`CompositionService: Executing FFmpeg command: ${cmd}`);
          if (onProgress) onProgress(25, "[Composition] Processing audio and video frame composition...");
        })
        .on("progress", (progress) => {
          if (progress.percent && onProgress) {
            // FFmpeg progress starts at 25% and goes up to 90%
            const percent = 25 + Math.round((progress.percent / 100) * 65);
            onProgress(Math.min(percent, 90), `[Composition] Compositing video frames (${Math.round(progress.percent)}%)...`);
          }
        })
        .on("end", () => {
          if (onProgress) onProgress(95, "[Composition] Verifying outputs...");
          if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
            return reject(new Error("CompositionService: Output file is empty or missing"));
          }
          if (onProgress) onProgress(100, "[Composition] Media composition complete!");
          
          resolve({
            composedVideoPath: sanitizePath(`storage/temp/${reelId}/composed.mp4`)
          });
        })
        .on("error", (err) => {
          logger.error(`CompositionService: FFmpeg failed: ${err.message}`);
          reject(new Error(`CompositionService FFmpeg failed: ${err.message}`));
        })
        .run();
    });
  }
}

module.exports = CompositionService;
