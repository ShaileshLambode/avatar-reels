const { Reel, Job } = require("../models");
const logger = require("../utils/logger");
const QueueManager = require("../queue/QueueManager");

// Create Reel
exports.createReel = async (req, res, next) => {
  try {
    const { prompt, config } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: "Prompt is required" });
    }

    const newReel = new Reel({ 
      prompt,
      config: config || {},
      status: "pending"
    });

    await newReel.save();
    logger.info(`Reel record created: ${newReel._id}`);

    // Try to auto-enqueue the first pipeline job (script generation)
    let scriptJobId = null;
    try {
      scriptJobId = await QueueManager.addJob("script", {
        reelId: newReel._id,
        prompt: newReel.prompt,
        config: newReel.config
      });

      // Update Reel with enqueued script job ID and transitioning status
      newReel.status = "scripting";
      newReel.currentStage = 1;
      newReel.pipeline.scriptJobId = scriptJobId;
      await newReel.save();
      logger.info(`Reel ${newReel._id} pipeline auto-started with job ID: ${scriptJobId}`);
    } catch (queueError) {
      logger.error(`Failed to auto-enqueue script job for Reel ${newReel._id}: ${queueError.message}`);
      // Fallback: keep status as pending and let user try again or retry manually
    }

    res.status(201).json({
      success: true,
      message: scriptJobId ? "Reel creation initialized and queued" : "Reel created but queue failed",
      reel: newReel,
      jobId: scriptJobId
    });
  } catch (error) {
    logger.error(`Error in createReel: ${error.message}`);
    next(error);
  }
};

// Get Single Reel
exports.getReel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const reel = await Reel.findById(id);

    if (!reel) {
      return res.status(404).json({ success: false, error: "Reel not found" });
    }

    res.status(200).json({
      success: true,
      reel
    });
  } catch (error) {
    logger.error(`Error in getReel: ${error.message}`);
    next(error);
  }
};

// List All Reels
exports.listReels = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = {};
    
    if (status) {
      filter.status = status;
    }

    const reels = await Reel.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reels.length,
      reels
    });
  } catch (error) {
    logger.error(`Error in listReels: ${error.message}`);
    next(error);
  }
};

// Delete Reel
exports.deleteReel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const reel = await Reel.findById(id);

    if (!reel) {
      return res.status(404).json({ success: false, error: "Reel not found" });
    }

    // Delete associated jobs
    await Job.deleteMany({ reelId: id });

    // Delete the reel
    await Reel.findByIdAndDelete(id);
    logger.info(`Reel record deleted: ${id}`);

    res.status(200).json({
      success: true,
      message: "Reel and associated jobs deleted successfully"
    });
  } catch (error) {
    logger.error(`Error in deleteReel: ${error.message}`);
    next(error);
  }
};
