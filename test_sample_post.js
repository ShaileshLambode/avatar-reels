const path = require("path");

async function postSampleReel() {
  const requestBody = {
    prompt: "A futuristic cyberpunk marketing agency vertical reel",
    config: {
      duration: 30,
      voice: "male_heroic",
      tone: "energetic"
    }
  };

  console.log("Sending POST request to create a 30-second sample reel...");
  console.log("Request Payload:", JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch("http://localhost:4001/api/reels", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Server returned status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    
    console.log("\n=======================================================");
    console.log("✅ SUCCESS: 30-Second Test Reel Created & Enqueued!");
    console.log(`Reel ID:      ${data._id || data.reelId}`);
    console.log(`Prompt:       "${data.prompt}"`);
    console.log(`Duration:     ${data.config?.duration || 30} seconds`);
    console.log("=======================================================");
    console.log("\nNext Steps:");
    console.log("1. Ensure TTS (5100) and Avatar (5200) servers are running.");
    console.log("2. Run 'node verify_sample.js' to monitor active progress!");
  } catch (error) {
    console.error("\n❌ ERROR creating sample reel:", error.message);
    console.error("Please make sure your Express backend is running on port 4001.");
  }
}

postSampleReel();
