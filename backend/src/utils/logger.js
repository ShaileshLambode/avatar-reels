const winston = require("winston");
const path = require("path");
const fs = require("fs");

const logDir = path.join(__dirname, "../../logs");

// Ensure logs directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "white"
};

winston.addColors(colors);

const formatConsole = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `[${info.timestamp}] [${info.level}]: ${info.message}`
  )
);

const formatFile = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const transports = [
  new winston.transports.Console({
    format: formatConsole,
    level: "debug"
  }),
  new winston.transports.File({
    filename: path.join(logDir, "error.log"),
    level: "error",
    format: formatFile
  }),
  new winston.transports.File({
    filename: path.join(logDir, "combined.log"),
    level: "info",
    format: formatFile
  })
];

const logger = winston.createLogger({
  level: "info",
  levels,
  transports
});

module.exports = logger;
