const http = require("http");
const express = require("express");
const cors = require("cors");
const config = require("./config/env");
const { connectDB } = require("./config/db");
const { connectRedis } = require("./config/redis");
const logger = require("./utils/logger");
const requestLogger = require("./middleware/requestLogger");
const errorHandler = require("./middleware/errorHandler");
const { initWebSocket } = require("./websocket/wsServer");

// Import Routes
const reelRoutes = require("./routes/reelRoutes");
const jobRoutes = require("./routes/jobRoutes");
const healthRoutes = require("./routes/healthRoutes");

const startServer = async () => {
  try {
    // 1. Database Connections
    await connectDB();
    
    // Graceful Redis boot: doesn't crash app if Docker Redis is off
    connectRedis();

    // 2. Express Setup
    const app = express();

    app.use(cors());
    app.use(express.json());
    app.use(requestLogger);

    // 3. Mount Routes
    app.use("/api/reels", reelRoutes);
    app.use("/api/jobs", jobRoutes);
    app.use("/api/health", healthRoutes);

    // Default route placeholder
    app.get("/", (req, res) => {
      res.send("AdWhiz AI Avatar Reel API is running...");
    });

    // Handle unknown routes
    app.use((req, res, next) => {
      res.status(404).json({ success: false, error: "Route not found" });
    });

    // 4. Global Error Handling
    app.use(errorHandler);

    // 5. Http & WebSocket Server initialization
    const server = http.createServer(app);
    initWebSocket(server);

    // 6. Initialize Queue System & Events Bridge
    const { initialize: initQueue, shutdown: shutdownQueue } = require("./queue/QueueManager");
    const { initQueueEvents } = require("./queue/queueEvents");
    
    try {
      await initQueue();
      initQueueEvents();
    } catch (queueErr) {
      logger.error(`Failed to initialize queue system during startup: ${queueErr.message}`);
    }

    // Start Listening
    const PORT = config.PORT || 4001;
    server.listen(PORT, () => {
      logger.info(`Server running in ${config.NODE_ENV} mode on port ${PORT}`);
    });

    // Graceful Shutdown
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      // Close queue worker and connections first
      try {
        await shutdownQueue();
      } catch (qErr) {
        logger.error(`Error during Queue System shutdown: ${qErr.message}`);
      }

      server.close(() => {
        logger.info("HTTP Server closed.");
        // Close DB connection
        const mongoose = require("mongoose");
        mongoose.connection.close(false).then(() => {
          logger.info("MongoDB Connection closed.");
          process.exit(0);
        });
      });

      // Force exit after 10s if graceful shutdown hangs
      setTimeout(() => {
        logger.error("Could not close connections in time, forcefully shutting down");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

  } catch (error) {
    logger.error(`Critical Server Startup Failure: ${error.message}`);
    process.exit(1);
  }
};

startServer();
