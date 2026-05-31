const WorkerRouter = require("./WorkerRouter");
const CpuWorker = require("./CpuWorker");

// Instantiate worker routing and concrete CPU worker singletons
const workerRouter = new WorkerRouter();
const cpuWorker = new CpuWorker();

// Register the CPU worker as the primary executor for Phase 1
workerRouter.register(cpuWorker);

module.exports = {
  workerRouter,
  cpuWorker,
  WorkerRouter,
  CpuWorker
};
