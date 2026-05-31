const JOB_TYPES = {
  SCRIPT: "script",
  VOICE: "voice",
  AVATAR: "avatar",
  LIPSYNC: "lipsync",
  COMPOSITION: "composition",
  REMOTION: "remotion"
};

const PIPELINE_ORDER = [
  JOB_TYPES.SCRIPT,
  JOB_TYPES.VOICE,
  JOB_TYPES.AVATAR,
  JOB_TYPES.LIPSYNC,
  JOB_TYPES.COMPOSITION,
  JOB_TYPES.REMOTION
];

const JOB_TYPE_TO_REEL_STATUS = {
  [JOB_TYPES.SCRIPT]: "scripting",
  [JOB_TYPES.VOICE]: "generating_voice",
  [JOB_TYPES.AVATAR]: "animating",
  [JOB_TYPES.LIPSYNC]: "lip_syncing",
  [JOB_TYPES.COMPOSITION]: "composing",
  [JOB_TYPES.REMOTION]: "rendering"
};

const JOB_DEFAULTS = {
  [JOB_TYPES.SCRIPT]: { timeout: 30000, retries: 3, priority: 1 },
  [JOB_TYPES.VOICE]: { timeout: 120000, retries: 3, priority: 2 },
  [JOB_TYPES.AVATAR]: { timeout: 7200000, retries: 2, priority: 3 },
  [JOB_TYPES.LIPSYNC]: { timeout: 180000, retries: 2, priority: 4 },
  [JOB_TYPES.COMPOSITION]: { timeout: 300000, retries: 2, priority: 5 },
  [JOB_TYPES.REMOTION]: { timeout: 600000, retries: 2, priority: 6 }
};

/**
 * Returns the next job type in the pipeline, or null if complete.
 * @param {string} currentType
 * @returns {string|null}
 */
const getNextJobType = (currentType) => {
  const index = PIPELINE_ORDER.indexOf(currentType);
  if (index === -1 || index === PIPELINE_ORDER.length - 1) {
    return null;
  }
  return PIPELINE_ORDER[index + 1];
};

/**
 * Returns the Reel status string for a given job type.
 * @param {string} jobType
 * @returns {string}
 */
const getReelStatusForJob = (jobType) => {
  return JOB_TYPE_TO_REEL_STATUS[jobType] || "pending";
};

/**
 * Returns the 1-based stage index (1-6) for currentStage field.
 * @param {string} jobType
 * @returns {number}
 */
const getStageIndex = (jobType) => {
  const index = PIPELINE_ORDER.indexOf(jobType);
  return index === -1 ? 0 : index + 1;
};

/**
 * Basic validation of job parameters based on the stage.
 * @param {string} type
 * @param {object} data
 * @returns {boolean}
 */
const validateJobData = (type, data) => {
  if (!data || !data.reelId) {
    return false;
  }
  if (type === JOB_TYPES.SCRIPT && !data.prompt) {
    return false;
  }
  return true;
};

module.exports = {
  JOB_TYPES,
  PIPELINE_ORDER,
  JOB_TYPE_TO_REEL_STATUS,
  JOB_DEFAULTS,
  getNextJobType,
  getReelStatusForJob,
  getStageIndex,
  validateJobData
};
