const { QueueEvents } = require("bullmq");
const { getRedisConnection } = require("../config/redis");
const logger = require("../utils/logger");

let queueEvents = null;

/**
 * Initialize BullMQ QueueEvents to monitor and log global queue lifecycle
 */
const initQueueEvents = () => {
  if (queueEvents) return queueEvents;

  try {
    const connection = getRedisConnection();
    
    queueEvents = new QueueEvents("reel-pipeline", {
      connection
    });

    queueEvents.on("waiting", ({ jobId }) => {
      logger.debug(`QueueEvent: Job ${jobId} is waiting in the queue`);
    });

    queueEvents.on("active", ({ jobId, prev }) => {
      logger.debug(`QueueEvent: Job ${jobId} is now active. Previous status: ${prev}`);
    });

    queueEvents.on("completed", ({ jobId, returnvalue }) => {
      logger.debug(`QueueEvent: Job ${jobId} completed successfully`);
    });

    queueEvents.on("failed", ({ jobId, failedReason }) => {
      logger.error(`QueueEvent: Job ${jobId} failed. Reason: ${failedReason}`);
    });

    queueEvents.on("progress", ({ jobId, data }) => {
      logger.debug(`QueueEvent: Job ${jobId} progress updated to ${data}%`);
    });

    logger.info("Queue Lifecycle Events Listener initialized");
  } catch (error) {
    logger.error(`Failed to initialize QueueEvents: ${error.message}`);
  }

  return queueEvents;
};

module.exports = {
  initQueueEvents
};
