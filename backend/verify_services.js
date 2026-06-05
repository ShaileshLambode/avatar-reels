const axios = require("axios");

const services = [
  { name: "LivePortrait", url: "http://localhost:5200/health" },
  { name: "MuseTalk", url: "http://localhost:5300/health" },
  { name: "CodeFormer", url: "http://localhost:5500/health" },
  { name: "XTTS (TTS)", url: "http://localhost:5100/health" }
];

async function verify() {
  console.log("=== Checking AI Microservices Health ===");
  for (const service of services) {
    try {
      const start = Date.now();
      const res = await axios.get(service.url, { timeout: 3000 });
      console.log(`[PASS] ${service.name} is running! Response time: ${Date.now() - start}ms. Status:`, res.data);
    } catch (err) {
      console.log(`[FAIL] ${service.name} is NOT running or failed check at ${service.url}. Error: ${err.message}`);
    }
  }
}

verify();
