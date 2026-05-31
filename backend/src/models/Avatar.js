const mongoose = require("mongoose");

const avatarSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    sourceImagePath: { type: String, required: true },
    voiceRefPath: { type: String }, // Optional voice reference WAV path
    isDefault: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Avatar", avatarSchema);
