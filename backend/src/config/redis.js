const Redis = require("ioredis");
const config = require("./env");
const logger = require("../utils/logger");

let redisConnection = null;

const connectRedis = () => {
  if (redisConnection) return redisConnection;

  try {
    // Graceful config: set retry strategy so it doesn't crash server if offline
    redisConnection = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null, // Critical requirement for BullMQ
      enableReadyCheck: false,
      retryStrategy(times) {
        const delay = Math.min(times * 100, 3000);
        return delay;
      }
    });

    redisConnection.on("connect", () => {
      logger.info(`Redis Connected to: ${config.REDIS_URL}`);
    });

    redisConnection.on("error", (err) => {
      // Don't overwhelm logs, show warning on error
      logger.warn(`Redis connection warning: ${err.message}`);
    });

    redisConnection.on("close", () => {
      logger.warn("Redis connection closed");
    });
  } catch (error) {
    logger.error(`Failed to initialize Redis client: ${error.message}`);
  }

  return redisConnection;
};

module.exports = {
  connectRedis,
  getRedisConnection: () => redisConnection || connectRedis()
};
