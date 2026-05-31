const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { getRedisConnection } = require("../config/redis");
const QueueManager = require("../queue/QueueManager");
const { workerRouter } = require("../workers");

router.get("/", async (req, res) => {
  const dbState = mongoose.connection.readyState;
  let dbStatus = "disconnected";
  
  if (dbState === 1) dbStatus = "connected";
  else if (dbState === 2) dbStatus = "connecting";
  else if (dbState === 3) dbStatus = "disconnecting";

  // Check Redis status
  const redis = getRedisConnection();
  const redisStatus = redis ? redis.status : "not_initialized";

  // Retrieve queue stats and active worker states
  let queueStats = { active: 0, waiting: 0, completed: 0, failed: 0 };
  let workersStatus = [];
  try {
    queueStats = await QueueManager.getQueueStats();
    workersStatus = workerRouter.getStatus();
  } catch (err) {
    // Graceful error handle if queue is not active or initialized
  }

  res.status(200).json({
    success: true,
    status: "ok",
    uptime: process.uptime(),
    mongodb: dbStatus,
    redis: redisStatus,
    queue: queueStats,
    workers: workersStatus,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
