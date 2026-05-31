const express = require("express");
const router = express.Router();
const reelController = require("../controllers/reelController");

router.post("/", reelController.createReel);
router.get("/", reelController.listReels);
router.get("/:id", reelController.getReel);
router.delete("/:id", reelController.deleteReel);

module.exports = router;
