const path = require("path");
const fs = require("fs");

// Ensure we target the right directory and load environmental variables from .env
const backendPath = path.resolve(__dirname, "../backend");
require("dotenv").config({ path: path.join(backendPath, ".env") });

// Require environmental config and force disable MOCK_AVATAR
const config = require(path.join(backendPath, "src/config/env"));
config.MOCK_AVATAR = false;

// Require the actual AvatarService class
const AvatarService = require(path.join(backendPath, "src/services/AvatarService"));
const avatarService = new AvatarService();

async function runTest() {
  console.log("==================================================");
  console.log("   LivePortrait Local Integration Standalone Test  ");
  console.log("==================================================");
  
  const assets = {
    audioPath: "storage/temp/sample/audio.wav"
  };
  
  const avatarConfig = {
    avatarImage: null, // Forces fallback to assets/avatars/default.png
    relative_motion_mode: true
  };
  
  const reelId = "test_liveportrait";
  
  try {
    const result = await avatarService.generateAvatar(
      assets,
      avatarConfig,
      reelId,
      (percent, message) => {
        console.log(`[PROGRESS ${percent}%] ${message}`);
      }
    );
    console.log("\n==================================================");
    console.log(" SUCCESS! Talking-head spokesperson video generated!");
    console.log(" Result Path:", result.avatarVideoPath);
    
    // Verify file exists on disk
    const absoluteVideoPath = path.resolve(__dirname, "..", result.avatarVideoPath);
    if (fs.existsSync(absoluteVideoPath)) {
      const stats = fs.statSync(absoluteVideoPath);
      console.log(` File Size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
      console.log(" Video file validated successfully.");
    } else {
      console.error(" ERROR: Result path was returned, but video file is missing from:", absoluteVideoPath);
    }
    console.log("==================================================");
  } catch (error) {
    console.error("\n==================================================");
    console.error(" TEST FAILED with generation error:");
    console.error(error.message);
    console.log("==================================================");
  }
}

runTest();
