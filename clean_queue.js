const path = require("path");
// Dynamically resolve node_modules from the backend subfolder
module.paths.push(path.resolve(__dirname, "backend/node_modules"));

const { Queue } = require("bullmq");

async function cleanQueue() {
  console.log("Connecting to Redis and initializing Queue 'reel-pipeline'...");
  
  const queue = new Queue("reel-pipeline", {
    connection: {
      host: "localhost",
      port: 6379
    }
  });

  try {
    console.log("Wiping all active, waiting, and failed jobs from the queue...");
    
    // Obliterate will completely wipe the queue state in Redis
    await queue.obliterate({ force: true });
    
    console.log("\n=======================================================");
    console.log("✅ SUCCESS: BullMQ Queue 'reel-pipeline' has been completely");
    console.log("   obliterated and reset to a clean state!");
    console.log("=======================================================");
    
    process.exit(0);
  } catch (err) {
    console.error("❌ Error obliterating queue:", err.message);
    process.exit(1);
  }
}

cleanQueue();
