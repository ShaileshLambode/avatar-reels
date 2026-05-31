const express = require("express");
const router = express.Router();
const jobController = require("../controllers/jobController");

router.get("/queue/stats", jobController.getQueueStats);
router.get("/:id", jobController.getJob);
router.get("/reel/:reelId", jobController.getReelJobs);

module.exports = router;
