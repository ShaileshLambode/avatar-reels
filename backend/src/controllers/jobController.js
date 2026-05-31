const { Job } = require("../models");
const logger = require("../utils/logger");

// Get Job Status
exports.getJob = async (req, res, next) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);

    if (!job) {
      return res.status(404).json({ success: false, error: "Job not found" });
    }

    res.status(200).json({
      success: true,
      job
    });
  } catch (error) {
    logger.error(`Error in getJob: ${error.message}`);
    next(error);
  }
};

// Get All Jobs for a specific Reel
exports.getReelJobs = async (req, res, next) => {
  try {
    const { reelId } = req.params;
    const jobs = await Job.find({ reelId }).sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      count: jobs.length,
      jobs
    });
  } catch (error) {
    logger.error(`Error in getReelJobs: ${error.message}`);
    next(error);
  }
};

// Get Queue Stats
exports.getQueueStats = async (req, res, next) => {
  try {
    const stats = await Job.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    const formattedStats = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      retrying: 0
    };

    stats.forEach((stat) => {
      if (formattedStats.hasOwnProperty(stat._id)) {
        formattedStats[stat._id] = stat.count;
      }
    });

    res.status(200).json({
      success: true,
      stats: formattedStats
    });
  } catch (error) {
    logger.error(`Error in getQueueStats: ${error.message}`);
    next(error);
  }
};
