const logger = require("../utils/logger");

const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const { method, originalUrl, ip } = req;
    const { statusCode } = res;

    logger.http(`${method} ${originalUrl} ${statusCode} - ${duration}ms - ${ip}`);
  });

  next();
};

module.exports = requestLogger;
