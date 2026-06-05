require("dotenv").config();

const requiredVars = ["MONGODB_URI"];
const optionalVars = [
  "REDIS_URL",
  "OPENAI_API_KEY",
  "TTS_SERVICE_URL",
  "AVATAR_SERVICE_URL",
  "HALLO_SERVICE_URL",
  "MUSETALK_SERVICE_URL",
  "CODEFORMER_SERVICE_URL",
  "AVATAR_ENGINE",
  "LIPSYNC_SERVICE_URL",
  "OPENAI_MODEL",
  "OPENAI_MAX_RETRIES",
  "NODE_ENV",
  "MOCK_AVATAR"
];

// Validate required env vars
const missingRequired = requiredVars.filter((v) => !process.env[v]);
if (missingRequired.length > 0) {
  console.error("CRITICAL CONFIG ERROR: Missing required environment variables:");
  missingRequired.forEach((v) => console.error(`  - ${v}`));
  process.exit(1);
}

// Warn about missing optional vars
const missingOptional = optionalVars.filter((v) => !process.env[v]);
if (missingOptional.length > 0) {
  console.warn("WARNING: Some optional environment variables are missing (some features might be disabled):");
  missingOptional.forEach((v) => console.warn(`  - ${v}`));
}

const config = {
  PORT: parseInt(process.env.PORT || "4001", 10),
  MONGODB_URI: process.env.MONGODB_URI,
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  TTS_SERVICE_URL: process.env.TTS_SERVICE_URL || "http://localhost:5100",
  AVATAR_SERVICE_URL: process.env.AVATAR_SERVICE_URL || "http://localhost:5200",
  HALLO_SERVICE_URL: process.env.HALLO_SERVICE_URL || "http://localhost:5400",
  MUSETALK_SERVICE_URL: process.env.MUSETALK_SERVICE_URL || "http://localhost:5300",
  CODEFORMER_SERVICE_URL: process.env.CODEFORMER_SERVICE_URL || "http://localhost:5500",
  AVATAR_ENGINE: process.env.AVATAR_ENGINE || "liveportrait", // 'liveportrait' or 'hallo'
  LIPSYNC_SERVICE_URL: process.env.LIPSYNC_SERVICE_URL || "http://localhost:5300",
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
  OPENAI_MAX_RETRIES: parseInt(process.env.OPENAI_MAX_RETRIES || "3", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  MOCK_AVATAR: process.env.MOCK_AVATAR === "true"
};

module.exports = Object.freeze(config);
