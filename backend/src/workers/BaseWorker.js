class BaseWorker {
  constructor(name, capabilities = []) {
    this.name = name;                // 'cpu', 'gpu', 'remote'
    this.capabilities = capabilities; // ['script', 'voice', 'avatar', ...]
    this.isAvailable = true;
    this.activeJobs = 0;
    this.lastError = null;
  }

  /**
   * Execute a job. Must be overridden by subclass.
   * @param {string} jobType - One of JOB_TYPES values
   * @param {object} jobData - Job payload (reelId, previous stage results, config)
   * @param {function} onProgress - Callback: (percent, message) => void
   * @returns {Promise<object>} Result data to store in Job.result
   */
  async execute(jobType, jobData, onProgress) {
    throw new Error(`execute() not implemented in BaseWorker subclass "${this.name}"`);
  }

  /**
   * Check if worker is capable and available to execute jobType.
   * @param {string} jobType
   * @returns {boolean}
   */
  canHandle(jobType) {
    return this.capabilities.includes(jobType) && this.isAvailable;
  }

  /**
   * Return status object of the worker.
   * @returns {object}
   */
  getStatus() {
    return {
      name: this.name,
      available: this.isAvailable,
      activeJobs: this.activeJobs,
      capabilities: this.capabilities,
      lastError: this.lastError ? this.lastError.message || this.lastError : null
    };
  }
}

module.exports = BaseWorker;
