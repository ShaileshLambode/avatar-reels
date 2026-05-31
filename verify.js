const path = require("path");

// Dynamically resolve node_modules from the backend subfolder
module.paths.push(path.resolve(__dirname, "backend/node_modules"));

// Explicitly configure dotenv to load environment variables from the backend folder
require("dotenv").config({ path: path.resolve(__dirname, "backend/.env") });

const mongoose = require("mongoose");
const Reel = require("./backend/src/models/Reel");
const config = require("./backend/src/config/env");

async function checkProgress() {
  try {
    // Suppress Mongoose buffering warnings
    mongoose.set("strictQuery", true);
    await mongoose.connect(config.MONGODB_URI);

    const reel = await Reel.findOne().sort({ createdAt: -1 });
    if (!reel) {
      console.log("No reels found in the database.");
      process.exit(0);
    }

    console.log("\n=================== CURRENT PIPELINE STATUS ===================");
    console.log(`Reel ID:      ${reel._id}`);
    console.log(`Prompt:       "${reel.prompt}"`);
    console.log(`Status:       ${reel.status.toUpperCase()}`);
    console.log(`CurrentStage: Stage ${reel.currentStage} / 6`);
    console.log(`Pipeline Jobs:`, JSON.stringify(reel.pipeline, null, 2));
    console.log(`Assets:       `, JSON.stringify(reel.assets, null, 2));
    if (reel.error) {
      console.log(`❌ Error:     ${reel.error}`);
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

checkProgress();
