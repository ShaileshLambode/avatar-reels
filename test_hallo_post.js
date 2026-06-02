const path = require("path");

async function postHalloReel() {
  const requestBody = {
    prompt: "A futuristic cyberpunk marketing agency vertical reel with Hallo3.",
    config: {
      duration: 30,
      voice: "Claribel Dervla",
      tone: "energetic",
      engine: "hallo" // Explicitly target the Hallo3 video transformer engine
    }
  };

  console.log("Sending POST request to create a 30-second Hallo3 sample reel...");
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
    const reel = data.reel || data;
    
    console.log("\n=======================================================");
    console.log("✅ SUCCESS: 30-Second Hallo3 Test Reel Created & Enqueued!");
    console.log(`Reel ID:      ${reel._id || data.reelId || "N/A"}`);
    console.log(`Prompt:       "${reel.prompt || "N/A"}"`);
    console.log(`Duration:     ${reel.config?.duration || 30} seconds`);
    console.log(`Engine Override: ${reel.config?.engine || "hallo"}`);
    console.log("=======================================================");
    console.log("\nNext Steps:");
    console.log("1. Ensure TTS (5100) and Hallo3 (5400) servers are running.");
    console.log("2. Run 'node verify_sample.js' to monitor active progress!");
  } catch (error) {
    console.error("\n❌ ERROR creating Hallo3 sample reel:", error.message);
    console.error("Please make sure your Express backend is running on port 4001.");
  }
}

postHalloReel();
