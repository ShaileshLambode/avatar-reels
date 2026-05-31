const mongoose = require("mongoose");

const sceneSchema = new mongoose.Schema({
  dialogue: { type: String, required: true },
  instruction: { type: String },
  duration: { type: Number, default: 5 } // Estimated duration in seconds
});

const reelSchema = new mongoose.Schema(
  {
    user: { type: String, default: "anonymous" }, // Default anonymous until integrated with auth
    prompt: { type: String, required: true },
    script: {
      hook: { type: String },
      scenes: [sceneSchema],
      caption: { type: String },
      cta: { type: String },
      totalDuration: { type: Number },
      avatarMood: { type: String }
    },
    status: {
      type: String,
      enum: [
        "pending",
        "scripting",
        "generating_voice",
        "animating",
        "lip_syncing",
        "composing",
        "rendering",
        "completed",
        "failed"
      ],
      default: "pending"
    },
    currentStage: { type: Number, default: 0 }, // 0 (pending) to 6 (done)
    pipeline: {
      scriptJobId: { type: String },
      voiceJobId: { type: String },
      avatarJobId: { type: String },
      lipSyncJobId: { type: String },
      compositionJobId: { type: String },
      remotionJobId: { type: String }
    },
    assets: {
      audioPath: { type: String },
      avatarVideoPath: { type: String },
      composedVideoPath: { type: String },
      finalReelPath: { type: String }
    },
    config: {
      voice: { type: String, default: "default" },
      avatarImage: { type: String, default: null },
      duration: { type: Number, default: 30 },
      template: { type: String, default: "modern" },
      music: { type: String },
      musicVolume: { type: Number, default: 0.15 },
      tone: { type: String, default: "professional" },
      industry: { type: String, default: "marketing" }
    },
    error: { type: String }
  },
  { timestamps: true }
);

// Indexes for performance
reelSchema.index({ user: 1, status: 1 });
reelSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Reel", reelSchema);
