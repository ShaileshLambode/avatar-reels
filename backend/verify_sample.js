const path = require("path");
const fs = require("fs");

// Dynamically resolve node_modules in the backend directory
module.paths.push(path.resolve(__dirname, "node_modules"));

// Configure dotenv
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const mongoose = require("mongoose");
const Reel = require("./src/models/Reel");
const config = require("./src/config/env");

async function checkSampleProgress() {
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(config.MONGODB_URI);

    const reel = await Reel.findOne().sort({ createdAt: -1 });
    if (!reel) {
      console.log("No reels found in the database. Run 'node test_sample_post.js' first.");
      process.exit(0);
    }

    console.log("\n=================== CURRENT PIPELINE STATUS ===================");
    console.log(`Reel ID:      ${reel._id}`);
    console.log(`Prompt:       "${reel.prompt}"`);
    console.log(`Status:       ${reel.status.toUpperCase()}`);
    console.log(`CurrentStage: Stage ${reel.currentStage} / 6`);
    console.log(`Pipeline Jobs:`, JSON.stringify(reel.pipeline, null, 2));
    console.log(`Assets:       `, JSON.stringify(reel.assets, null, 2));

    if (reel.status.toLowerCase() === "animating") {
      console.log("------------------ CPU TELEMETRY ANALYSIS -------------------");
      
      // Check for audio track wav file size to calculate frames (WAV: 24kHz 16bit Mono is 48000 bytes/sec)
      const tempAudioPath = path.resolve(__dirname, `../storage/temp/${reel._id}/audio.wav`);
      if (fs.existsSync(tempAudioPath)) {
        const stats = fs.statSync(tempAudioPath);
        const durationSec = stats.size / 48000;
        const totalFrames = Math.round(durationSec * 25);
        
        console.log(`Audio Length: ${durationSec.toFixed(2)} seconds`);
        console.log(`Total Frames: ${totalFrames} frames`);
        
        const { execSync } = require("child_process");
        try {
          const processesRaw = execSync("powershell -Command \"Get-Process -Name python -ErrorAction SilentlyContinue | Select-Object Id, CPU | ConvertTo-Json\"").toString();
          if (processesRaw.trim()) {
            const processes = JSON.parse(processesRaw);
            const procList = Array.isArray(processes) ? processes : [processes];
            
            // Find active python process running inference
            const activeInference = procList.find(p => p.CPU > 20);
            
            if (activeInference) {
              const cpuSeconds = activeInference.CPU;
              // Under 2-CPU cores, parallel execution is ~1.0 second per frame
              const estSecPerFrame = 1.0;
              const estFramesDone = Math.min(totalFrames, Math.round(cpuSeconds / estSecPerFrame / 2));
              const percent = Math.min(100, Math.round((estFramesDone / totalFrames) * 100));
              const remainingFrames = Math.max(0, totalFrames - estFramesDone);
              const remainingSec = remainingFrames * estSecPerFrame;
              
              console.log(`\nActive Thread: PID ${activeInference.Id}`);
              console.log(`CPU Time Used: ${Math.round(cpuSeconds)} CPU seconds`);
              console.log(`Render Speed: ~${estSecPerFrame} second per frame (2-CPU Parallel)`);
              console.log(`Estimated:    ${estFramesDone} / ${totalFrames} frames rendered (${percent}%)`);
              console.log(`Remaining:    ${remainingFrames} frames (~${Math.round(remainingSec)} seconds left)`);
            } else {
              console.log("\nStatus: Initializing PyTorch checkpoints in memory...");
            }
          }
        } catch (procErr) {
          console.log("\nStatus: Active rendering progressing in background...");
        }
      } else {
        console.log("\nAudio track has not been written to disk yet.");
      }
      console.log("-------------------------------------------------------------");
    }

    if (reel.error) {
      console.log(`❌ Error:     ${reel.error}`);
    } else if (reel.status.toLowerCase() === "completed") {
      console.log("🎉 SUCCESS: Reel has completed successfully!");
      console.log(`Final Video:  c:/Users/1/AiMaven/adwhiz/avatar-reels/${reel.assets.finalReelPath}`);
    } else {
      console.log(`✅ Errors:    None`);
    }
    console.log("===============================================================");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

checkSampleProgress();
