const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");

/**
 * Generate a secure, unique ID
 * @returns {string} UUID v4
 */
const generateId = () => {
  return uuidv4();
};

/**
 * Normalize and sanitize path for Windows compatibility
 * @param {string} filePath - Path to sanitize
 * @returns {string} Sanitized path
 */
const sanitizePath = (filePath) => {
  if (!filePath) return "";
  return path.normalize(filePath).replace(/\\/g, "/");
};

/**
 * Ensure directory exists
 * @param {string} dirPath - Directory path
 */
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

/**
 * Get formatted current ISO timestamp
 * @returns {string} ISO date string
 */
const getTimestamp = () => {
  return new Date().toISOString();
};

module.exports = {
  generateId,
  sanitizePath,
  ensureDir,
  getTimestamp
};
