const { Server } = require("socket.io");
const logger = require("../utils/logger");

let io = null;

const initWebSocket = (httpServer) => {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      origin: "*", // Adjust for production environments later
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    logger.info(`WebSocket Client Connected: ${socket.id}`);

    // Join specific reel's room to get status updates
    socket.on("join:reel", (reelId) => {
      if (reelId) {
        socket.join(`reel:${reelId}`);
        logger.info(`Socket ${socket.id} joined room: reel:${reelId}`);
      }
    });

    // Leave specific reel's room
    socket.on("leave:reel", (reelId) => {
      if (reelId) {
        socket.leave(`reel:${reelId}`);
        logger.info(`Socket ${socket.id} left room: reel:${reelId}`);
      }
    });

    socket.on("disconnect", () => {
      logger.info(`WebSocket Client Disconnected: ${socket.id}`);
    });
  });

  logger.info("WebSocket Server Initialized");
  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("WebSocket Server not initialized yet");
  }
  return io;
};

module.exports = {
  initWebSocket,
  getIO
};
