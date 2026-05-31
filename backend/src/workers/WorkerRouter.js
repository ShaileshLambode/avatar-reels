const logger = require("../utils/logger");

class WorkerRouter {
  constructor() {
    this.workers = [];
  }

  /**
   * Register a worker instance into the router
   * @param {BaseWorker} worker 
   */
  register(worker) {
    this.workers.push(worker);
    logger.info(`Registered worker: ${worker.name} with capabilities [${worker.capabilities.join(", ")}]`);
  }

  /**
   * Find the most appropriate worker capable of handling a job type
   * @param {string} jobType 
   * @returns {BaseWorker}
   */
  selectWorker(jobType) {
    const capableWorkers = this.workers.filter((w) => w.canHandle(jobType));
    
    if (capableWorkers.length === 0) {
      throw new Error(`No worker available to handle job type: ${jobType}`);
    }

    // Phase 1: Default to the first available capable worker (CPU worker).
    // Future expansion: Sort by workload, proximity to resources, or prioritize GPU workers.
    return capableWorkers[0];
  }

  /**
   * Route and execute a job on the appropriate worker
   * @param {string} jobType 
   * @param {object} jobData 
   * @param {function} onProgress 
   * @returns {Promise<object>}
   */
  async route(jobType, jobData, onProgress) {
    const worker = this.selectWorker(jobType);
    return await worker.execute(jobType, jobData, onProgress);
  }

  /**
   * Retrieve statuses of all registered workers
   * @returns {Array<object>}
   */
  getStatus() {
    return this.workers.map((w) => w.getStatus());
  }
}

module.exports = WorkerRouter;
