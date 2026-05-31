const { Queue, Worker } = require("bullmq");
const { getRedisConnection } = require("../config/redis");
const Job = require("../models/Job");
const Reel = require("../models/Reel");
const { workerRouter } = require("../workers");
const {
  JOB_TYPES,
  JOB_DEFAULTS,
  getReelStatusForJob,
  getStageIndex,
  getNextJobType
} = require("./jobDefinitions");
const logger = require("../utils/logger");
const { getIO } = require("../websocket/wsServer");

let reelQueue = null;
let reelWorker = null;

/**
 * Emit websocket updates safely
 */
const emitToReelRoom = (reelId, event, payload) => {
  try {
    const io = getIO();
    io.to(`reel:${reelId}`).emit(event, payload);
    logger.info(`WS emitted [${event}] to room reel:${reelId}`);
  } catch (err) {
    logger.warn(`Could not emit WebSocket event ${event} to reel:${reelId}: ${err.message}`);
  }
};

/**
 * Main BullMQ job execution processor
 */
const processJob = async (bullJob) => {
  const mongooseJobId = bullJob.name;
  const { type, reelId } = bullJob.data;
  
  logger.info(`Processing BullMQ job ${bullJob.id} of type ${type} for Reel ${reelId}`);

  // 1. Update Job record to processing
  const mongooseJob = await Job.findById(mongooseJobId);
  if (!mongooseJob) {
    throw new Error(`Mongoose Job record ${mongooseJobId} not found`);
  }
  mongooseJob.status = "processing";
  mongooseJob.startedAt = new Date();
  mongooseJob.retryCount = bullJob.attemptsMade; // Track attempt number
  await mongooseJob.save();

  // 2. Update Reel record status and stage
  const reelStatus = getReelStatusForJob(type);
  const stageIndex = getStageIndex(type);
  
  const reel = await Reel.findById(reelId);
  if (!reel) {
    throw new Error(`Reel record ${reelId} not found`);
  }
  reel.status = reelStatus;
  reel.currentStage = stageIndex;

  // Make sure we also assign the pipeline job ID if it isn't set yet
  const pipelineField = `${type}JobId`;
  reel.pipeline[pipelineField] = mongooseJobId;
  await reel.save();

  // 3. Emit stage start event
  emitToReelRoom(reelId, "pipeline:stage_start", {
    reelId,
    stage: stageIndex,
    jobType: type,
    jobId: mongooseJobId
  });

  // 4. Run worker execution router with progress callback
  const result = await workerRouter.route(type, bullJob.data, async (progressPercent, progressMessage) => {
    try {
      // Use direct atomic update to prevent parallel save conflicts
      await Job.updateOne(
        { _id: mongooseJobId },
        { $set: { progress: progressPercent } }
      );
      // Keep the local mongooseJob object in sync
      mongooseJob.progress = progressPercent;

      // Emit progress to WS Room
      emitToReelRoom(reelId, "pipeline:progress", {
        reelId,
        stage: stageIndex,
        jobType: type,
        progress: progressPercent,
        message: progressMessage
      });
      
      // Also update BullMQ progress
      await bullJob.updateProgress(progressPercent);
    } catch (err) {
      logger.error(`Error reporting progress: ${err.message}`);
    }
  });

  // 5. If execution succeeded:
  mongooseJob.status = "completed";
  mongooseJob.progress = 100;
  mongooseJob.result = result;
  mongooseJob.completedAt = new Date();
  await mongooseJob.save();

  // Save stage asset path results back to Reel schema
  if (result) {
    if (type === JOB_TYPES.SCRIPT) {
      reel.script = {
        hook: result.hook,
        scenes: result.scenes,
        caption: result.caption,
        cta: result.cta,
        totalDuration: result.totalDuration,
        avatarMood: result.avatarMood
      };
    }
    if (result.audioPath) {
      reel.assets.audioPath = result.audioPath;
    }
    if (result.avatarVideoPath) {
      reel.assets.avatarVideoPath = result.avatarVideoPath;
    }
    if (result.composedVideoPath) {
      reel.assets.composedVideoPath = result.composedVideoPath;
    }
    if (result.finalReelPath) {
      reel.assets.finalReelPath = result.finalReelPath;
    }
  }
  await reel.save();

  emitToReelRoom(reelId, "pipeline:stage_complete", {
    reelId,
    stage: stageIndex,
    jobType: type,
    result
  });

  // 6. Chain next job if available
  const nextType = getNextJobType(type);
  if (nextType) {
    logger.info(`Chaining next stage: ${nextType} for reel: ${reelId}`);
    const nextJobData = {
      reelId,
      prompt: reel.prompt,
      config: reel.config,
      script: reel.script,
      assets: reel.assets
    };
    await addJob(nextType, nextJobData);
  } else {
    // Pipeline fully completed!
    reel.status = "completed";
    await reel.save();
    
    emitToReelRoom(reelId, "pipeline:done", {
      reelId,
      finalReelPath: reel.assets.finalReelPath
    });
    logger.info(`Pipeline completed successfully for Reel ${reelId}!`);
  }

  return result;
};

/**
 * Initialize BullMQ queues and workers
 */
const initialize = async () => {
  if (reelQueue) return;

  const connection = getRedisConnection();
  
  reelQueue = new Queue("reel-pipeline", {
    connection,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: false
    }
  });

  reelWorker = new Worker("reel-pipeline", processJob, {
    connection,
    concurrency: 1
  });

  // Worker Lifecycle Listeners
  reelWorker.on("active", (job) => {
    logger.info(`BullMQ Worker active: Job ${job.id} started`);
  });

  reelWorker.on("completed", (job) => {
    logger.info(`BullMQ Worker completed: Job ${job.id}`);
  });

  reelWorker.on("failed", async (bullJob, err) => {
    if (!bullJob) return;
    const mongooseJobId = bullJob.name;
    const { type, reelId } = bullJob.data;
    const isFinal = bullJob.attemptsMade >= bullJob.opts.attempts;
    
    logger.error(`BullMQ job ${bullJob.id} (${type}) failed: ${err.message}. Attempts: ${bullJob.attemptsMade}/${bullJob.opts.attempts}`);

    try {
      const mongooseJob = await Job.findById(mongooseJobId);
      if (mongooseJob) {
        mongooseJob.error = err.message;
        if (isFinal) {
          mongooseJob.status = "failed";
          mongooseJob.completedAt = new Date();
        } else {
          mongooseJob.status = "retrying";
        }
        await mongooseJob.save();
      }

      if (isFinal) {
        const reel = await Reel.findById(reelId);
        if (reel) {
          reel.status = "failed";
          reel.error = `Stage [${type}] failed: ${err.message}`;
          await reel.save();
        }

        emitToReelRoom(reelId, "pipeline:error", {
          reelId,
          stage: getStageIndex(type),
          jobType: type,
          error: err.message,
          retryCount: bullJob.attemptsMade,
          isFinal: true
        });
      } else {
        emitToReelRoom(reelId, "pipeline:error", {
          reelId,
          stage: getStageIndex(type),
          jobType: type,
          error: err.message,
          retryCount: bullJob.attemptsMade,
          isFinal: false
        });
      }
    } catch (dbErr) {
      logger.error(`Failed to handle job failure database updates: ${dbErr.message}`);
    }
  });

  logger.info("Queue System Initialized (Queue 'reel-pipeline' + Worker Concurrency 1)");
};

/**
 * Add a new job to the pipeline
 * @param {string} type 
 * @param {object} data 
 * @param {object} options 
 * @returns {Promise<string>} Mongoose job ID
 */
const addJob = async (type, data, options = {}) => {
  if (!reelQueue) {
    throw new Error("Queue not initialized. Call initialize() first.");
  }
  
  const mongooseJob = new Job({
    reelId: data.reelId,
    type,
    status: "queued",
    workerType: "cpu",
    maxRetries: JOB_DEFAULTS[type]?.retries || 3
  });
  await mongooseJob.save();
  
  const bullJob = await reelQueue.add(
    mongooseJob._id.toString(),
    {
      type,
      ...data,
      jobId: mongooseJob._id.toString()
    },
    {
      jobId: mongooseJob._id.toString(),
      timeout: JOB_DEFAULTS[type]?.timeout || 60000,
      attempts: (JOB_DEFAULTS[type]?.retries || 3) + 1, // BullMQ attempts = retries + 1
      backoff: {
        type: "exponential",
        delay: 2000
      },
      ...options
    }
  );

  logger.info(`Enqueued job: Mongoose ID ${mongooseJob._id} | BullMQ ID ${bullJob.id} for Reel ${data.reelId}`);
  return mongooseJob._id.toString();
};

/**
 * Retrieve current BullMQ stats
 */
const getQueueStats = async () => {
  if (!reelQueue) {
    return { active: 0, waiting: 0, completed: 0, failed: 0 };
  }
  const [active, waiting, completed, failed] = await Promise.all([
    reelQueue.getActiveCount(),
    reelQueue.getWaitingCount(),
    reelQueue.getCompletedCount(),
    reelQueue.getFailedCount()
  ]);
  return { active, waiting, completed, failed };
};

/**
 * Shutdown queue and worker gracefully
 */
const shutdown = async () => {
  logger.info("Shutting down Queue System...");
  if (reelWorker) {
    await reelWorker.close();
    reelWorker = null;
  }
  if (reelQueue) {
    await reelQueue.close();
    reelQueue = null;
  }
  logger.info("Queue System shut down completely.");
};

module.exports = {
  initialize,
  addJob,
  getQueueStats,
  shutdown
};
