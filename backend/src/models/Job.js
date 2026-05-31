const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    reelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reel",
      required: true
    },
    type: {
      type: String,
      enum: ["script", "voice", "avatar", "lipsync", "composition", "remotion"],
      required: true
    },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed", "retrying"],
      default: "queued"
    },
    workerType: {
      type: String,
      enum: ["cpu", "gpu", "remote"],
      default: "cpu"
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    result: { type: mongoose.Schema.Types.Mixed },
    error: { type: String },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    startedAt: { type: Date },
    completedAt: { type: Date }
  },
  { timestamps: true }
);

// Indexes
jobSchema.index({ reelId: 1, type: 1 });
jobSchema.index({ status: 1 });

module.exports = mongoose.model("Job", jobSchema);
