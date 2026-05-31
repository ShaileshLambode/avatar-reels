const logger = require("../utils/logger");
const config = require("../config/env");

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  logger.error(`[Express Error] ${statusCode} - ${message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
  if (err.stack) {
    logger.debug(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(config.NODE_ENV === "development" && { stack: err.stack })
  });
};

module.exports = errorHandler;
